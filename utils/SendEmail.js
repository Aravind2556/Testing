const nodemailer = require('nodemailer');

/**
 * @param {string} recipientEmail - The recipient's email address
 * @param {string} otp - The OTP to be sent
 * @param {string} purpose - The purpose of the OTP, either "signup" or "forgot-password"
 */
async function sendEmail(recipientEmail, otp, purpose) {
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_EMAIL || 'your_gmail@example.com',
      pass: process.env.SMTP_PASSWORD || 'your_gmail_app_password'
    }
  });

  // Determine the email content based on the purpose
  let subject, mainMessage, footerMessage;

  if (purpose === 'signup') {
    subject = 'Welcome to CareerConnect Ai Job Portal - OTP Verification';
    mainMessage = `Your OTP code for signing up is:`;
    footerMessage = 'Please use this OTP to complete your registration process.';
  } else if (purpose === 'forgot-password') {
    subject = 'Reset Your Password - OTP Verification';
    mainMessage = `Your OTP code for password reset is:`;
    footerMessage = 'Use this OTP to reset your password. The code will expire in 5 minutes.';
  } else {
    subject = 'OTP Code';
    mainMessage = `Your OTP code is:`;
    footerMessage = 'If you didn’t request this, please ignore this email.';
  }

  // Inline Tailwind CSS styling for the email (for email client compatibility)
  const htmlTemplate = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <style>
        /* Inline Tailwind CSS styles for email clients */
        body { font-family: Arial, sans-serif; }
        .bg-primary { background-color: #1853b5; }
        .text-white { color: #FFFFFF; }
        .text-center { text-align: center; }
        .rounded-lg { border-radius: 8px; }
        .p-6 { padding: 1.5rem; }
        .font-bold { font-weight: bold; }
        .mt-4 { margin-top: 1rem; }
        .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
        .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
        .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
        .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
        .my-3 { margin-top: 0.75rem; margin-bottom: 0.75rem; }
        .mx-auto { margin-left: auto; margin-right: auto; }
        .text-gray-600 { color: #4A4A4A; }
        .bg-gray-600 { background-color: #4A4A4A; }
        .block { display: block; }
        .w-fit { width: fit-content; }
      </style>
    </head>
    <body class="bg-gray-100">

      <!-- Email Content -->
      <div class="max-w-lg mx-auto bg-white p-6 rounded-lg shadow-lg mt-10">
        <h2 class="text-2xl font-bold text-center text-primary">${subject}</h2>
        <p class="text-center mt-4">Hi there,</p>
        <p class="text-center mt-2">${mainMessage}</p>

        <div class="my-3">
          <span class="block w-fit mx-auto text-3xl rounded-lg font-bold bg-primary text-white px-3 py-1">${otp}</span>
        </div>

        <p class="text-center mt-4 text-sm text-gray-600">${footerMessage}</p>
        <p class="text-center mt-4 text-sm text-gray-600">This OTP is only valid for 5 minutes.</p>

        <div class="text-center mt-6 text-gray-600">
          <p>Thanks,</p>
          <p>The CareerConnect Ai Team</p>
        </div>
      </div>
      
    </body>
  </html>
  `;

  let mailOptions = {
    from: `"SAN - Job Portal" <${process.env.SMTP_EMAIL}>`,
    to: recipientEmail,
    subject: subject,
    text: '', // Plain-text body for non-HTML email clients
    html: htmlTemplate // HTML version with Tailwind CSS styles
  };

  try {
    await transporter.sendMail(mailOptions);
    return true
  }
  catch (err) {
    console.error("Error sending email:", err);
    return false
  }

}

module.exports = sendEmail;
