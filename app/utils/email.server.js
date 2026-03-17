import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

console.log("API KEY:", process.env.RESEND_API_KEY);
const resend = new Resend('re_7LFADHVm_15wzX4dN5tqRFjhnNjmaMaWc');

export async function sendEmailAlert(products) {

    if (products.length === 0) return; // No critical items, no email needed  

    // -------- Build HTML Email --------
    const html = `
  <div style="
    font-family: Arial, sans-serif;
    background: #f9fafb;
    padding: 20px;
  ">

    <div style="
      max-width: 600px;
      margin: auto;
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    ">

      <h2 style="margin-bottom: 10px;">
        🚨 StockRisk Alert
      </h2>

      <p style="color: #555;">
        Some products are about to run out of stock.
      </p>

      <table style="
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      ">

        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px; text-align:left;">Product</th>
            <th style="padding: 10px;">Stock</th>
            <th style="padding: 10px;">Days Left</th>
          </tr>
        </thead>

        <tbody>
          ${products.map(p => `
            <tr>
              <td style="padding: 10px;">${p.title}</td>
              <td style="padding: 10px; text-align:center;">${p.stock}</td>
              <td style="padding: 10px; text-align:center; color:red; font-weight:bold;">
                ${p.daysLeft} days
              </td>
            </tr>
          `).join("")}
        </tbody>

      </table>

      <div style="
        margin-top: 20px;
        padding: 15px;
        background: #fff4e5;
        border-radius: 8px;
      ">
        ⚠️ Recommended: Restock soon to avoid revenue loss.
      </div>

      <p style="
        margin-top: 20px;
        font-size: 12px;
        color: #888;
      ">
        Powered by StockRisk 🚀
      </p>

    </div>
  </div>
  `;

    try {

      // -------- TEMP: Send Test Email --------

       //'You can only send testing emails to your own email address
      //(mukundmmudgal@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, and
      // change the `from` address to an email using this domain
        const response = await resend.emails.send({
            from: "StockRisk <onboarding@resend.dev>", // works for testing
            to: ["mukundmmudgal@gmail.com"], // 👈 PUT YOUR EMAIL HERE
            subject: "🚨 Stock Alert - Products Running Out",
            html
        });

        console.log("✅ Email sent:", response);

    } catch (error) {
        console.error("❌ Email failed:", error);
    }

    // -------- TEMP: Console Output --------
    console.log("🚨 EMAIL ALERT TRIGGERED");
    console.log(html);


    // -------- FUTURE: REAL EMAIL --------
    /*
    await resend.emails.send({
      from: "alerts@stockrisk.com",
      to: "merchant@email.com",
      subject: "🚨 Stock Alert - Products Running Out",
      html
    });
    */
}