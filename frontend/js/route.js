// app/api/reserve/route.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "onboarding@resend.dev",
  to: reservation.email,
  subject: "Study Space Reservation Confirmed",
  html: `
    <h2>Reservation Confirmed</h2>
    <p>Hello ${reservation.name},</p>
    <p>Your reservation has been successfully booked.</p>

    <ul>
      <li>Date: ${reservation.date}</li>
      <li>Time: ${reservation.time}</li>
      <li>Location: ${reservation.room}</li>
    </ul>
  `
});