require("dotenv").config({ path: ".env.local" });
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  try {
    const data = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "lereicel@kean.edu",
      subject: "MyStudySpace Test Email",
      html: "<h1>Test email works!</h1>",
    });

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
};