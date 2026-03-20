import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend('re_7LFADHVm_15wzX4dN5tqRFjhnNjmaMaWc');

export async function sendEmailAlert({ items, totalRisk, summary }) {

  if (!items || items.length === 0) return;
  console.log("Preparing to send email alert for", items.length,items, "items with total risk of", totalRisk);
  // -------- Build HTML Email --------
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="...">
  <div style="...">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">
        🚨 StockRisk Alert
      </h1>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 16px;">
        ${items.length} product${items.length !== 1 ? 's' : ''} need your attention
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">

      <!-- Executive Summary -->
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 32px; border: 1px solid #e2e8f0;">
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1;">
            <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
              Total at Risk
            </p>
            <p style="margin: 4px 0 0; font-size: 32px; font-weight: 700; color: #dc2626;">
              $${totalRisk ? Math.round(totalRisk).toLocaleString() : '0'}
            </p>
          </div>
          <div style="flex: 1;">
            <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
              Critical Items
            </p>
            <p style="margin: 4px 0 0; font-size: 32px; font-weight: 700; color: #1e293b;">
              ${items.length}
            </p>
          </div>
          ${summary?.warning > 0 ? `
          <div style="flex: 1;">
            <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
              To Watch
            </p>
            <p style="margin: 4px 0 0; font-size: 32px; font-weight: 700; color: #d97706;">
              ${summary.warning}
            </p>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Critical Items Table -->
      ${items.length > 0 ? `
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0 0 16px; display: flex; align-items: center; gap: 8px;">
          <span style="background: #dc2626; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span>
          🔥 Immediate Action Required
        </h2>
        
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 12px; text-align: left; font-size: 14px; font-weight: 600; color: #475569;">Product</th>
              <th style="padding: 12px; text-align: center; font-size: 14px; font-weight: 600; color: #475569;">Stock</th>
              <th style="padding: 12px; text-align: center; font-size: 14px; font-weight: 600; color: #475569;">Days Left</th>
              <th style="padding: 12px; text-align: center; font-size: 14px; font-weight: 600; color: #475569;">Impact</th>
              <th style="padding: 12px; text-align: center; font-size: 14px; font-weight: 600; color: #475569;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => {
              // Determine action and badge color
              let action = p.action || 'ORDER NOW';
              let badgeBg = '#dc2626';
              let badgeColor = 'white';
              
              if (p.action?.includes('REFUND')) {
                badgeBg = '#fee2e2';
                badgeColor = '#dc2626';
              } else if (p.action?.includes('RESTOCK')) {
                badgeBg = '#dc2626';
                badgeColor = 'white';
              }
              
              return `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px; font-weight: 500;">${p.name || p.title}</td>
                <td style="padding: 12px; text-align: center;">
                  <span style="background: ${p.stock < 0 ? '#fee2e2' : p.stock === 0 ? '#ffedd5' : '#f1f5f9'}; color: ${p.stock < 0 ? '#dc2626' : p.stock === 0 ? '#9a3412' : '#1e293b'}; padding: 4px 8px; border-radius: 20px; font-weight: 500; font-size: 13px;">
                    ${p.stock < 0 ? `Oversold (${Math.abs(p.stock)})` : p.stock}
                  </span>
                </td>
                <td style="padding: 12px; text-align: center; font-weight: 600; color: ${p.daysLeft && p.daysLeft < 7 ? '#dc2626' : '#d97706'};">
                  ${p.daysLeft ? p.daysLeft + ' days' : 'Out of stock'}
                </td>
                <td style="padding: 12px; text-align: center; font-weight: 600; color: #dc2626;">
                  $${Math.round(p.impact || 0).toLocaleString()}
                </td>
                <td style="padding: 12px; text-align: center;">
                  <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block;">
                    ${action}
                  </span>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Quick Action Summary -->
      <div style="background: #f0f9ff; border-radius: 12px; padding: 20px; margin: 32px 0; border: 1px solid #bae6fd;">
        <h3 style="margin: 0 0 12px; font-size: 16px; color: #0369a1;">📋 Quick Action Summary</h3>
        <div style="font-family: monospace; background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-line;">
          ${items.map(p => {
            if (p.stock < 0) return `🔴 ${p.name || p.title}: ADJUST INVENTORY (oversold by ${Math.abs(p.stock)})`;
            if (p.stock === 0) return `🟠 ${p.name || p.title}: RESTOCK IMMEDIATELY`;
            if (p.reorderQty > 0) return `🔵 ${p.name || p.title} → order ${p.reorderQty} units (${p.daysLeft} days left)`;
            return null;
          }).filter(Boolean).join('\n')}
        </div>
      </div>

      <!-- Footer Actions -->
      <div style="text-align: center; margin: 32px 0 0;">
        <a href="https://your-app.com/dashboard" style="background: #1e293b; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin: 0 8px 8px 0;">
          📊 View Dashboard
        </a>
      </div>

      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">Powered by <span style="font-weight: 600; color: #1e293b;">StockRisk</span> 🚀</p>
      </div>

    </div>
  </div>
</body>
</html>
  `;

  try {
    const response = await resend.emails.send({
      from: "StockRisk <onboarding@resend.dev>",
      to: ["mukundmmudgal@gmail.com"],
      subject: `🚨 StockRisk Alert: ${items.length} products need attention`,
      html
    });

    console.log("✅ Email sent:", response);
  } catch (error) {
    console.error("❌ Email failed:", error);
  }
}