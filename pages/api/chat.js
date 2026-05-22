import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DBS = {
  inventory: "e96750e6-e789-4730-a4c1-3fbaf86c1cb4",
  equipment: "1108a370-6463-49b0-a31f-2c627c8fbba2",
  invoices: "f1adf92c-c46e-4997-9467-cb1af3ac545e",
  revenue: "bc1c9496-f659-4b4b-a060-2d0984dfe650",
};

async function queryNotion(db) {
  if (!DBS[db]) return null;
  try {
    const response = await notion.databases.query({
      database_id: DBS[db],
      page_size: 50,
    });
    return response.results.map((p) => {
      const props = p.properties;
      const obj = {};
      for (const [key, val] of Object.entries(props)) {
        if (val.title) obj[key] = val.title.map((t) => t.plain_text).join("");
        else if (val.rich_text) obj[key] = val.rich_text.map((t) => t.plain_text).join("");
        else if (val.number !== undefined) obj[key] = val.number;
        else if (val.select) obj[key] = val.select?.name;
        else if (val.checkbox !== undefined) obj[key] = val.checkbox;
        else if (val.date) obj[key] = val.date?.start;
      }
      return obj;
    });
  } catch (e) {
    return null;
  }
}

function detectDatabase(text) {
  const t = text.toLowerCase();
  if (t.match(/inventory|stock|part|capacitor|contactor|filter|wire|conduit|thermostat|refrigerant|motor|how many/)) return "inventory";
  if (t.match(/equipment|unit|condenser|furnace|mini.?split|heat pump|carrier|lennox|mitsubishi|daikin|seer|ton/)) return "equipment";
  if (t.match(/invoice|payment|paid|pending|overdue|billing|owed/)) return "invoices";
  if (t.match(/revenue|monthly|goal|sales|made|earned/)) return "revenue";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const lastMessage = req.body.messages?.[req.body.messages.length - 1]?.content || "";
  const dbName = detectDatabase(lastMessage);
  let contextNote = "";

  if (dbName) {
    const data = await queryNotion(dbName);
    if (data) {
      contextNote = `\n\nLIVE DATA from Reliable H&C ${dbName} database:\n${JSON.stringify(data, null, 2)}\n\nUse this real data to answer the technician's question.`;
    }
  }

  const messages = [...req.body.messages];
  if (contextNote && messages.length > 0) {
    messages[messages.length - 1] = {
      ...messages[messages.length - 1],
      content: messages[messages.length - 1].content + contextNote,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...req.body, messages }),
  });
  const data = await response.json();
  res.status(200).json(data);
}
