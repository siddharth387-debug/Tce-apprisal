import nodemailer from 'nodemailer';

const SUBSECTION_LABELS = {
  '1.1': '1.1 Courses Handled',
  '1.2': '1.2 Course Files',
  '1.3': '1.3 Course Design',
  '1.4': '1.4 Value Added Courses',
  '1.5': '1.5 Innovative Teaching Methods',
  '1.6': '1.6 Academic Collaborations',
  '1.7': '1.7 Mentoring System',
  '1.8': '1.8 NPTEL / Professional Certifications',
  '1.9': '1.9 Student Feedback',
  '1.10': '1.10 Result Analysis',
  '1.11': '1.11 CO Attainment',
  '2.1': '2.1 Journal Publications',
  '2.2': '2.2 Citations Received',
  '2.3': '2.3 Total Q1 Citations',
  '2.4': '2.4 Books & Chapters Published',
  '2.5': '2.5 Conference Publications',
  '2.6': '2.6 Research Collaborations',
  '2.7': '2.7 PhD Scholars Registered',
  '2.8': '2.8 PhD Scholars Awarded',
  '3.1': '3.1 Patents Published',
  '3.2': '3.2 Patents Granted',
  '3.3': '3.3 Transfer of Technology',
  '3.4': '3.4 Prototypes Developed',
  '3.5': '3.5 Hackathon Mentoring & Prizes',
  '3.6': '3.6 Architectural Design Competitions',
  '4.1': '4.1 Sponsored Research Projects',
  '4.2': '4.2 Consultancy Projects',
  '5.1': '5.1 International Engagement',
  '5.2': '5.2 Visiting Positions',
  '5.3': '5.3 Foreign Student Mentoring',
  '5.4': '5.4 Global Research Grants',
  '5.5': '5.5 International Advisory Boards',
  '5.6': '5.6 Architectural Heritage Documentation',
  '6.1': '6.1 FDP / Workshops Attended',
  '6.2': '6.2 Programs / FDPs Organized',
  '6.3': '6.3 Invited Talks / Resource Person',
  '6.4': '6.4 Professional Body Memberships',
  '6.5': '6.5 Awards and Recognitions',
  '6.6': '6.6 Editorial / Reviewer Roles',
  '7.1': '7.1 Partial Delivery by Industry',
  '7.2': '7.2 Industrial Visits Organized',
  '7.3': '7.3 Student Internship Mentoring',
  '7.4': '7.4 Industry MoUs Signed',
  '8.1': '8.1 Student Project Publications',
  '8.2': '8.2 Student Co-curricular Mentoring',
  '8.3': '8.3 Student Innovation / Startups',
  '8.4': '8.4 Architectural Exhibition Guidance',
  '9.1': '9.1 Department Level Activities',
  '9.2': '9.2 College Level Activities',
  '9.3': '9.3 Institutional Development Responsibilities',
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendRejectionEmail({
  toEmail,
  facultyName,
  timeline,
  hodName,
  hodDepartment,
  hodRemarks,
  subsectionRemarks,
}) {
  try {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM || user || 'no-reply@tce.edu';

    if (!host || !user || !pass) {
      console.warn('[Mailer] SMTP credentials not set. Rejection email skipped.');
      return false;
    }

    if (!toEmail) {
      console.warn('[Mailer] No recipient email specified for rejection notice.');
      return false;
    }

    const safeFacultyName = facultyName || 'Faculty Member';
    const safeTimeline = timeline || 'the academic period';
    const safeHodName = hodName || 'Head of Department';
    const safeDept = hodDepartment ? `Dept of ${hodDepartment}` : 'Department';

    // Build plain text remarks list
    const remarksLines = [];
    if (hodRemarks && String(hodRemarks).trim()) {
      remarksLines.push(`Overall Remarks: ${String(hodRemarks).trim()}`);
    }

    if (subsectionRemarks && typeof subsectionRemarks === 'object') {
      for (const [subKey, val] of Object.entries(subsectionRemarks)) {
        if (val && String(val).trim()) {
          const label = SUBSECTION_LABELS[subKey] || `Section ${subKey}`;
          remarksLines.push(`${label}: ${String(val).trim()}`);
        }
      }
    }

    const remarksText = remarksLines.length > 0
      ? `\nHoD Feedback & Remarks:\n${remarksLines.map(r => `  - ${r}`).join('\n')}\n`
      : '\nNo specific remarks were provided.\n';

    const textBody = `Dear ${safeFacultyName},

Your faculty appraisal for ${safeTimeline} was not approved by the Head of Department, ${safeHodName} (${safeDept}).
${remarksText}
Please log in to the Faculty Appraisal Workbench, review the feedback, update your submission, and submit it again for evaluation.

Regards,
TCE Faculty Appraisal System`;

    // HTML remarks list
    const htmlRemarks = remarksLines.length > 0
      ? `<div style="margin: 16px 0; padding: 12px; background-color: #fef2f2; border-left: 4px solid #b91c1c; border-radius: 4px;">
           <h4 style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px;">HoD Feedback &amp; Remarks:</h4>
           <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
             ${remarksLines.map(r => `<li style="margin-bottom: 4px;">${escapeHtml(r)}</li>`).join('')}
           </ul>
         </div>`
      : '<p style="color: #6b7280; font-size: 13px; font-style: italic;">No specific remarks were provided.</p>';

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb;">
    <h2 style="color: #4A1519; margin-top: 0;">Faculty Appraisal Notice</h2>
    <p>Dear <strong>${escapeHtml(safeFacultyName)}</strong>,</p>
    <p>Your faculty self-appraisal for academic year <strong>${escapeHtml(safeTimeline)}</strong> was not approved by the Head of Department, <strong>${escapeHtml(safeHodName)}</strong> (${escapeHtml(safeDept)}).</p>
    ${htmlRemarks}
    <p>Please log in to the <strong>TCE Faculty Appraisal Workbench</strong>, update the required sections based on the HoD feedback, and submit again for evaluation.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
    <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">This is an automated notification from the TCE Faculty Appraisal System. Please do not reply directly to this email.</p>
  </div>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `TCE Faculty Appraisal System <${from}>`,
      to: toEmail,
      subject: `Your faculty appraisal for ${safeTimeline} was not approved`,
      text: textBody,
      html: htmlBody,
    });

    console.log(`✉️ Rejection email successfully sent to ${toEmail} for timeline ${safeTimeline}`);
    return true;
  } catch (err) {
    console.error('❌ [Mailer] Failed to send rejection email:', err.message);
    return false;
  }
}
