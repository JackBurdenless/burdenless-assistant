import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DBS = {
  inventory: "e96750e6-e789-4730-a4c1-3fbaf86c1cb4",
  equipment: "1108a370-6463-49b0-a31f-2c627c8fbba2",
  invoices: "f1adf92c-c46e-4997-9467-cb1af3ac545e",
  revenue: "bc1c9496-f659-4b4b-a060-2d0984dfe650",
};

export default async function handler(req, res) {
  const { db, query } = req.body || {};
  if (!DBS[db]) return res.status(400).json({ error: "Unknown database" });

  try {
    const response = await notion.databases.query({
      database_id: DBS[db],
      page_size: 50,
    });
    const items = response.results.map((p) => {
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
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
