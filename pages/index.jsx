import { useState, useRef, useEffect } from "react";

const RATE = {
  labor: 95,
  materialMarkup: 1.3,
  parts: {
    "conduit (per ft)": 2.10,
    "wire (per ft)": 1.85,
    "capacitor": 38,
    "contactor": 52,
    "thermostat": 145,
    "refrigerant (per lb)": 85,
    "filter": 22,
    "blower motor": 285,
    "compressor": 890,
    "service call": 89,
  }
};

const SYSTEM_PROMPT = `You are the Burdenless Field Assistant — an expert HVAC technician support AI for Reliable Heating & Cooling (Wyomissing, PA).

You help field technicians with:
1. HVAC troubleshooting: error codes, system diagnostics, unit-specific questions
2. Change order quoting: when a tech asks to price a job addition, respond with a JSON block
3. Future work logging: capture customer interest for follow-up

HVAC KNOWLEDGE:
- Common error codes: E1=indoor sensor fault, E2=outdoor sensor fault, E3=high pressure, E4=low pressure, E5=compressor overload, E6=communication error, E7=DC fan motor fault, F1=freeze protection, F2=defrost cycle
- Refrigerants: R-22 (legacy, expensive), R-410A (current standard), R-32 (newer)
- Capacitor failure symptoms: hard start, humming, not cooling, motor won't spin
- Low refrigerant signs: ice on lines, warm air, hissing, high electric bill
- Dirty filter effects: restricted airflow, freeze-up, high static pressure
- Compressor checks: measure amp draw vs RLA on nameplate; check capacitor first before condemning compressor
- SEER ratings: 13-14 minimum, 16-20 good efficiency, 20+ premium
- Tonnage: 1 ton = 12,000 BTU; typical home = 1 ton per 400-600 sq ft

RATE CARD:
- Labor: $95/hr billed in 15-min increments
- Parts have 30% markup
- Service call: $89
- Conduit: $2.10/ft, Wire: $1.85/ft, Capacitor: $38, Contactor: $52, Thermostat: $145, Refrigerant: $85/lb, Blower motor: $285, Compressor: $890

QUOTE FORMAT - when a tech asks to price additional work, respond with a short explanation then this exact JSON block:
\`\`\`quote
{
  "items": [
    {"description": "35 ft conduit", "qty": 35, "unit": "ft", "unitPrice": 2.73, "total": 95.55},
    {"description": "Labor 15 min", "qty": 0.25, "unit": "hr", "unitPrice": 95, "total": 23.75}
  ],
  "subtotal": 119.30,
  "tax": 8.35,
  "total": 127.65,
  "summary": "Add 35 ft conduit + 15 min labor"
}
\`\`\`

FOLLOW-UP FORMAT - when a customer mentions future work they want, respond normally AND include:
\`\`\`followup
{
  "interest": "New smart thermostat installation",
  "urgency": "low",
  "notes": "Customer wants Ecobee, mentioned after summer",
  "marketingAngle": "Mention our fall thermostat special"
}
\`\`\`

Be concise, professional, field-practical. Technicians are busy.`;

function parseBlocks(text) {
  const blocks = [];
  const allMatches = [];
  let m;
  const qRe = /\`\`\`quote\s*([\s\S]*?)\`\`\`/g;
  while ((m = qRe.exec(text)) !== null) allMatches.push({ type: "quote", index: m.index, end: m.index + m[0].length, raw: m[1] });
  const fRe = /\`\`\`followup\s*([\s\S]*?)\`\`\`/g;
  while ((m = fRe.exec(text)) !== null) allMatches.push({ type: "followup", index: m.index, end: m.index + m[0].length, raw: m[1] });
  allMatches.sort((a, b) => a.index - b.index);
  let last = 0;
  for (const match of allMatches) {
    if (match.index > last) blocks.push({ type: "text", content: text.slice(last, match.index) });
    try { blocks.push({ type: match.type, data: JSON.parse(match.raw.trim()) }); }
    catch { blocks.push({ type: "text", content: match.raw }); }
    last = match.end;
  }
  if (last < text.length) blocks.push({ type: "text", content: text.slice(last) });
  return blocks.filter(b => b.type !== "text" || b.content.trim());
}

function QuoteCard({ data, onApprove, approved }) {
  return (
    <div style={{ background: "linear-gradient(135deg,#0f2744,#1a3a6b)", border: "1px solid #2a5298", borderRadius: 12, padding: 16, margin: "8px 0", fontFamily: "monospace", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>🧾</span>
        <span style={{ color: "#7eb8f7", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>Change Order</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a5298" }}>
            {["Item","Qty","Unit $","Total"].map(h => (
              <th key={h} style={{ color: "#7eb8f7", textAlign: h === "Item" ? "left" : "right", padding: "4px 6px", fontSize: 11, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #1e3a6e" }}>
              <td style={{ color: "#e8f0fe", padding: "5px 6px" }}>{item.description}</td>
              <td style={{ color: "#a8c4f0", textAlign: "right", padding: "5px 6px" }}>{item.qty}</td>
              <td style={{ color: "#a8c4f0", textAlign: "right", padding: "5px 6px" }}>${item.unitPrice.toFixed(2)}</td>
              <td style={{ color: "#fff", textAlign: "right", padding: "5px 6px", fontWeight: 600 }}>${item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10, borderTop: "1px solid #2a5298", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#a8c4f0", fontSize: 12, marginBottom: 3 }}>
          <span>Subtotal</span><span>${data.subtotal.toFixed(2)}</span>
        </div>
        {data.tax && <div style={{ display: "flex", justifyContent: "space-between", color: "#a8c4f0", fontSize: 12, marginBottom: 3 }}>
          <span>Tax</span><span>${data.tax.toFixed(2)}</span>
        </div>}
        <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 16, fontWeight: 700, marginTop: 6 }}>
          <span>TOTAL</span><span>${data.total.toFixed(2)}</span>
        </div>
      </div>
      {!approved ? (
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button onClick={() => onApprove(data, "approved")} style={{ flex: 1, background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✓ Customer Approved</button>
          <button onClick={() => onApprove(data, "declined")} style={{ flex: 1, background: "#374151", color: "#9ca3af", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>✗ Declined</button>
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: approved === "approved" ? "#14532d" : "#1f2937", color: approved === "approved" ? "#86efac" : "#9ca3af", textAlign: "center", fontWeight: 700, fontSize: 13 }}>
          {approved === "approved" ? "✓ Added to Invoice" : "✗ Declined"}
        </div>
      )}
    </div>
  );
}

function FollowupCard({ data, onSave, saved }) {
  const urgencyColor = { low: "#f59e0b", medium: "#f97316", high: "#ef4444" };
  return (
    <div style={{ background: "linear-gradient(135deg,#1a1f2e,#1e2d1e)", border: "1px solid #2d4a2d", borderRadius: 12, padding: 14, margin: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <span style={{ color: "#86efac", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Future Work Lead</span>
        <span style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 10, background: (urgencyColor[data.urgency] || "#f59e0b") + "33", color: urgencyColor[data.urgency] || "#f59e0b", fontWeight: 600 }}>{(data.urgency || "low").toUpperCase()}</span>
      </div>
      <div style={{ color: "#d1fae5", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{data.interest}</div>
      {data.notes && <div style={{ color: "#6ee7b7", fontSize: 12, marginBottom: 6 }}>{data.notes}</div>}
      {data.marketingAngle && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: "#0f2010", borderRadius: 6, padding: "6px 10px" }}>
          <span>💡</span>
          <span style={{ color: "#a7f3d0", fontSize: 12 }}>{data.marketingAngle}</span>
        </div>
      )}
      {!saved ? (
        <button onClick={onSave} style={{ marginTop: 12, width: "100%", background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📎 Log Follow-up</button>
      ) : (
        <div style={{ marginTop: 10, padding: 7, borderRadius: 8, background: "#14532d", color: "#86efac", textAlign: "center", fontWeight: 700, fontSize: 13 }}>✓ Saved to Follow-ups</div>
      )}
    </div>
  );
}

function MessageBubble({ msg, onQuoteAction, onFollowupSave }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "6px 0" }}>
        <div style={{ background: "#2563eb", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 15px", maxWidth: "80%", fontSize: 14, lineHeight: 1.5 }}>{msg.content}</div>
      </div>
    );
  }
  const blocks = parseBlocks(msg.content || "");
  return (
    <div style={{ margin: "6px 0" }}>
      {blocks.map((block, i) => {
        if (block.type === "text") return (
          <div key={i} style={{ background: "#1e2433", color: "#e2e8f0", borderRadius: "4px 18px 18px 18px", padding: "10px 15px", maxWidth: "90%", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: blocks.length > 1 ? 4 : 0 }}>{block.content}</div>
        );
        if (block.type === "quote") return <QuoteCard key={i} data={block.data} onApprove={(d, s) => onQuoteAction(msg.id, i, d, s)} approved={msg.quoteStatuses?.[i]} />;
        if (block.type === "followup") return <FollowupCard key={i} data={block.data} onSave={() => onFollowupSave(msg.id, i, block.data)} saved={msg.followupSaved?.[i]} />;
        return null;
      })}
    </div>
  );
}

export default function BurdenlessAssistant() {
  const [messages, setMessages] = useState([{ id: "init", role: "assistant", content: "Hey — Burdenless Field Assistant online. What are you working on?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("chat");
  const [invoice, setInvoice] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [jobInfo, setJobInfo] = useState({ tech: "Technician", address: "Job Site", unit: "" });
  const [editingJob, setEditingJob] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { id: Date.now().toString(), role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);
    try {
      const history = newMessages.filter(m => m.id !== "init").map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-ipc": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, system: SYSTEM_PROMPT, messages: history })
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "Sorry, no response.";
      setMessages(prev => [...prev, { id: Date.now().toString() + "r", role: "assistant", content: reply, quoteStatuses: {}, followupSaved: {} }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: "err", role: "assistant", content: "Could not reach AI. Check connection." }]);
    }
    setLoading(false);
  }

  function handleQuoteAction(msgId, blockIdx, data, status) {
    setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, quoteStatuses: { ...m.quoteStatuses, [blockIdx]: status } }));
    if (status === "approved") {
      setInvoice(prev => [...prev, { id: Date.now().toString(), summary: data.summary, items: data.items, total: data.total, timestamp: new Date().toLocaleTimeString() }]);
    }
  }

  function handleFollowupSave(msgId, blockIdx, data) {
    setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, followupSaved: { ...m.followupSaved, [blockIdx]: true } }));
    setFollowups(prev => [...prev, { id: Date.now().toString(), ...data, savedAt: new Date().toLocaleTimeString() }]);
  }

  const invoiceTotal = invoice.reduce((s, i) => s + i.total, 0);
  const tabStyle = (active) => ({ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: active ? "#1e3a6b" : "transparent", color: active ? "#7eb8f7" : "#4a5568", fontWeight: active ? 700 : 500, fontSize: 12, cursor: "pointer" });
  const cardStyle = { background: "#1a2236", border: "1px solid #2a3a54", borderRadius: 12, padding: 14, marginBottom: 12 };
  const inputStyle = { flex: 1, background: "#1a2236", border: "1px solid #2a3a54", borderRadius: 22, padding: "10px 16px", color: "#e2e8f0", fontSize: 14, outline: "none" };

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#0d1117", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg,#0f2744,#1a1f2e)", borderBottom: "1px solid #1e2d4a", padding: "12px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔧</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Burdenless Assistant</div>
            <div style={{ fontSize: 11, color: "#7eb8f7" }}>Reliable H&C · Field Tool</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", cursor: "pointer" }} onClick={() => setEditingJob(true)}>
            <div style={{ fontSize: 12, color: "#7eb8f7", fontWeight: 600 }}>{jobInfo.tech}</div>
            <div style={{ fontSize: 11, color: "#4a6a9a" }}>{jobInfo.address}</div>
          </div>
        </div>
        {editingJob && (
          <div style={{ background: "#0d1627", borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#7eb8f7", fontWeight: 700, marginBottom: 8 }}>Job Info</div>
            {[["Tech Name","tech"],["Address","address"],["Unit / Model","unit"]].map(([label, key]) => (
              <input key={key} placeholder={label} value={jobInfo[key]} onChange={e => setJobInfo(j => ({ ...j, [key]: e.target.value }))}
                style={{ ...inputStyle, display: "block", width: "100%", marginBottom: 6, boxSizing: "border-box" }} />
            ))}
            <button onClick={() => setEditingJob(false)} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Save</button>
          </div>
        )}
        <div style={{ display: "flex", background: "#131a24", borderRadius: 10, padding: 3, gap: 2 }}>
          {[["chat","💬 Chat"],["invoice",`🧾 Invoice${invoice.length ? " ("+invoice.length+")" : ""}`],["followups",`📋 Follow-ups${followups.length ? " ("+followups.length+")" : ""}`]].map(([key, label]) => (
            <button key={key} style={tabStyle(tab === key)} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column" }}>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} onQuoteAction={handleQuoteAction} onFollowupSave={handleFollowupSave} />)}
            {loading && (
              <div style={{ display: "flex", gap: 5, padding: "10px 15px", alignItems: "center" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb", animation: "bounce 1.2s infinite", animationDelay: i*0.2+"s" }} />)}
                <style>{"`@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`"}</style>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderTop: "1px solid #1e2d4a", background: "#0d1117", flexShrink: 0 }}>
            <input style={inputStyle} placeholder="Ask about error codes, quote a change order..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendMessage(); }} />
            <button onClick={sendMessage} disabled={loading} style={{ background: loading ? "#1e3a6b" : "linear-gradient(135deg,#2563eb,#1d4ed8)", color: loading ? "#4a6a9a" : "#fff", border: "none", borderRadius: "50%", width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "default" : "pointer", fontSize: 16 }}>↑</button>
          </div>
        </>
      )}

      {tab === "invoice" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div><div style={{ fontWeight: 700, fontSize: 16 }}>Invoice</div><div style={{ color: "#4a6a9a", fontSize: 12 }}>{jobInfo.address} · {jobInfo.tech}</div></div>
            {invoice.length > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#7eb8f7" }}>${invoiceTotal.toFixed(2)}</div><div style={{ fontSize: 11, color: "#4a6a9a" }}>{invoice.length} change order{invoice.length !== 1 ? "s" : ""}</div></div>}
          </div>
          {invoice.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#4a6a9a" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 14 }}>No change orders yet.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Ask for a quote in chat and tap Customer Approved to add it here.</div>
            </div>
          ) : invoice.map((item, i) => (
            <div key={item.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Change Order #{i+1}</div>
                <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, background: "#22c55e22", color: "#22c55e", fontSize: 11, fontWeight: 700 }}>Approved</span>
              </div>
              <div style={{ color: "#a0aec0", fontSize: 13, marginBottom: 8 }}>{item.summary}</div>
              {item.items.map((li, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#718096", marginBottom: 3 }}>
                  <span>{li.description}</span><span>${li.total.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #2a3a54", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#7eb8f7", fontWeight: 700 }}>Total</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>${item.total.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#4a6a9a", marginTop: 6 }}>Added {item.timestamp}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "followups" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Follow-up Leads</div>
            <div style={{ color: "#4a6a9a", fontSize: 12 }}>Customer interest captured in the field</div>
          </div>
          {followups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#4a6a9a" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14 }}>No follow-ups yet.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Tell the assistant what the customer mentioned and it will create a follow-up automatically.</div>
            </div>
          ) : followups.map(f => (
            <div key={f.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#d1fae5" }}>{f.interest}</div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#f59e0b22", color: "#f59e0b", fontWeight: 600 }}>{(f.urgency||"low").toUpperCase()}</span>
              </div>
              {f.notes && <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 8 }}>{f.notes}</div>}
              {f.marketingAngle && (
                <div style={{ background: "#0d1627", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 8 }}>
                  <span>💡</span><span style={{ color: "#a7f3d0", fontSize: 12 }}>{f.marketingAngle}</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: "#4a6a9a", marginTop: 8 }}>Logged {f.savedAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
