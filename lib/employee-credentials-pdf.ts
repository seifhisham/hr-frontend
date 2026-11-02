import { jsPDF } from "jspdf";

type Credential = { name: string; email: string; password: string };

export function createCredentialsPdf(
  credentials: Credential[],
  fontBase64: string,
  workspace: string,
  loginUrl: string,
) {
  const pdf = new jsPDF({ format: "a4", compress: true });
  pdf.addFileToVFS("Amiri-Regular.ttf", fontBase64);
  pdf.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  const pageHeader = () => {
    pdf.setFont("helvetica", "bold").setFontSize(18);
    pdf.text("Employee account passwords", 20, 22);
    pdf.setFont("helvetica", "normal").setFontSize(10);
    pdf.text(`Company code: ${workspace || "Use your company code"}`, 20, 31);
    pdf.text(pdf.splitTextToSize(`Sign in: ${loginUrl}`, 170), 20, 37);
  };
  pageHeader();
  let y = 53;
  for (const credential of credentials) {
    pdf.setFont("Amiri", "normal").setFontSize(16);
    const names: string[] = pdf.splitTextToSize(credential.name, 170);
    pdf.setFont("helvetica", "normal").setFontSize(11);
    const emails: string[] = pdf.splitTextToSize(`Email: ${credential.email}`, 170);
    pdf.setFont("courier", "bold").setFontSize(12);
    const passwords: string[] = pdf.splitTextToSize(credential.password, 170);
    const height = names.length * 7 + emails.length * 5 + passwords.length * 6 + 18;
    if (y + height > 270) { pdf.addPage(); pageHeader(); y = 53; }
    pdf.setTextColor(25, 25, 25).setFont("Amiri", "normal").setFontSize(16);
    const rtl = /[\u0600-\u06ff]/.test(credential.name);
    pdf.text(names, rtl ? 190 : 20, y, { align: rtl ? "right" : "left" });
    y += names.length * 7 + 2;
    pdf.setFont("helvetica", "normal").setFontSize(11);
    pdf.text(emails, 20, y); y += emails.length * 5 + 3;
    pdf.setFontSize(9); pdf.text("PASSWORD", 20, y); y += 6;
    pdf.setFont("courier", "bold").setFontSize(12); pdf.text(passwords, 20, y);
    y += passwords.length * 6 + 7;
    pdf.setDrawColor(220, 220, 220); pdf.line(20, y, 190, y); y += 8;
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page).setFont("helvetica", "normal").setFontSize(9).setTextColor(90, 90, 90);
    pdf.text("Confidential - share each password only with its employee.", 20, 285);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 190, 285, { align: "right" });
  }
  return pdf;
}
