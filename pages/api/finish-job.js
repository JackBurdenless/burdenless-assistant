import { Resend } from "resend";
import { Client } from "@notionhq/client";

const resend = new Resend(process.env.RESEND_API_KEY);
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const INVENTORY_DB = "e96750e6-e789-4730-a4c1-3fbaf86c1cb4";

async function getLowStock() {
  try {
    const response = await notion.dataSources.query({
      data_source_id: INVENTORY_DB,
      page_size: 50,
    });
    const lowStock = [];
    for (const p of response.results) {
      const props = p.properties;
      const name = props["Part Name"]?.title?.map(t => t.plain_text).join("") || "";
      const qty = props["Qty In Stock"]?.number ?? 0;
      const threshold = props["Reorder Threshold"]?.number ?? 0;
      const supplier = props["Supplier"]?.rich_text?.map(t => t.plain_text).join("") || "";
      const partNum = props["Part Number"]?.rich_text?.map(t => t.plain_text).join("") || "";
      if (qty <= threshold && threshold > 0) {
        lowStock.push({ name, partNum, qty, threshold, supplier });
      }
    }
    return lowStock;
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { jobInfo, invoice, followups, partsUsed } = req.body;
  const lowStock = await getLowStock();

  const total = invoice.reduce((s, i) => s + i.total, 0);
  const endTime = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#f7f7f7;padding:20px;">
      <div style="background:#0f2744;color:#fff;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;">🏁 Job Complete</h1>
        <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">Reliable Heating &amp; Cooling — Field Report</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
        <h2 style="margin:0 0 8px;color:#0f2744;font-size:16px;">Job Info</h2>
        <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:4px 0;color:#666;width:120px;">Technician</td><td style="font-weight:600;">${jobInfo.tech || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Address</td><td style="font-weight:600;">${jobInfo.address || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Unit / Model</td><td style="font-weight:600;">${jobInfo.unit || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Completed</td><td style="font-weight:600;">${endTime}</td></tr>
        </table>

        <h2 style="margin:0 0 8px;color:#0f2744;font-size:16px;">Change Orders (${invoice.length})</h2>
        ${invoice.length === 0 ? '<p style="color:#999;font-size:13px;">No change orders this job.</p>' : invoice.map((co, i) => `
          <div style="background:#f0f4f8;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid #2563eb;">
            <div style="font-weight:700;font-size:14px;color:#0f2744;">CO #${i + 1}: ${co.summary}</div>
            <div style="font-size:12px;color:#666;margin-top:6px;">
              ${co.items.map(li => `${li.description} — $${li.total.toFixed(2)}`).join("<br/>")}
            </div>
            <div style="font-weight:700;font-size:14px;color:#0f2744;margin-top:8px;text-align:right;">$${co.total.toFixed(2)}</div>
          </div>
        `).join("")}

        <div style="background:#0f2744;color:#fff;padding:14px;border-radius:8px;margin:16px 0;display:flex;justify-content:space-between;">
          <span style="font-weight:600;">TOTAL BILLED</span>
          <span style="font-weight:700;font-size:18px;">$${total.toFixed(2)}</span>
        </div>

        ${followups.length > 0 ? `
          <h2 style="margin:20px 0 8px;color:#0f2744;font-size:16px;">Follow-up Leads (${followups.length})</h2>
          ${followups.map(f => `
            <div style="background:#f0f8f0;border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid #22c55e;">
              <div style="font-weight:700;font-size:14px;color:#15803d;">${f.interest}</div>
              ${f.notes ? `<div style="font-size:12px;color:#555;margin-top:4px;">${f.notes}</div>` : ""}
              ${f.marketingAngle ? `<div style="font-size:12px;color:#15803d;margin-top:6px;">💡 ${f.marketingAngle}</div>` : ""}
              <div style="font-size:11px;color:#888;margin-top:6px;">Urgency: ${(f.urgency || "low").toUpperCase()}</div>
            </div>
          `).join("")}
        ` : ""}

        ${lowStock.length > 0 ? `
          <h2 style="margin:20px 0 8px;color:#991b1b;font-size:16px;">⚠️ Low Stock Alerts (${lowStock.length})</h2>
          <div style="background:#fef2f2;border-radius:8px;padding:14px;border-left:3px solid #dc2626;">
            ${lowStock.map(item => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #fecaca;">
                <div>
                  <div style="font-weight:600;font-size:13px;color:#991b1b;">${item.name}</div>
                  <div style="font-size:11px;color:#666;">${item.partNum} · ${item.supplier}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:13px;font-weight:700;color:#dc2626;">${item.qty} in stock</div>
                  <div style="font-size:11px;color:#888;">reorder at ${item.threshold}</div>
                </div>
              </div>
            `).join("")}
            <div style="font-size:12px;color:#666;margin-top:10px;font-style:italic;">Reorder these parts to avoid running out on the next job.</div>
          </div>
        ` : ""}

        ${partsUsed && partsUsed.length > 0 ? `
          <h2 style="margin:20px 0 8px;color:#0f2744;font-size:16px;">Parts Used</h2>
          <ul style="font-size:13px;color:#555;padding-left:20px;">
            ${partsUsed.map(p => `<li>${p}</li>`).join("")}
          </ul>
        ` : ""}

        <p style="margin-top:24px;color:#999;font-size:12px;text-align:center;">
          Sent automatically by Burdenless Field Assistant
        </p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "Burdenless Assistant <onboarding@resend.dev>",
      to: process.env.BOSS_EMAIL,
      subject: `🏁 Job Complete: ${jobInfo.tech || "Tech"} @ ${jobInfo.address || "Job Site"} — $${total.toFixed(2)}${lowStock.length > 0 ? ` · ⚠️ ${lowStock.length} low stock` : ""}`,
      html,
    });
    res.status(200).json({ success: true, lowStockCount: lowStock.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
