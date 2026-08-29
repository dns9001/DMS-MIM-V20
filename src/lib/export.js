import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { rupiah, todayLocal } from "./format";
import { isTechnicalId } from "./skuResolver";

/**
 * Sanitize cell text to ensure technical IDs are never exposed in reports
 */
function sanitizeCellText(val) {
  if (val === null || val === undefined) return "-";
  if (typeof val === "number") return val;
  const str = String(val);
  
  // Replace patterns like "sku-178770073895: 50 BKS" with "Produk SKU: 50 BKS" or clean text if encountered
  return str.replace(/sku-\d+/gi, "Produk SKU")
            .replace(/prd-\d+/gi, "Produk");
}

/**
 * Export data to CSV and trigger browser download
 */
export function exportToCSV(filename, headers, rows) {
  if (!rows || !rows.length) return;
  const csvHeaders = headers.join(",");
  const csvRows = rows.map((r) =>
    headers
      .map((h) => {
        const val = sanitizeCellText(r[h] ?? "");
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const csvContent = "data:text/csv;charset=utf-8," + [csvHeaders, ...csvRows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}-${todayLocal()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export data to XLSX and trigger browser download
 */
export function exportToXLSX(filename, sheetName, data) {
  if (!data || !data.length) return;
  const sanitizedData = data.map((row) => {
    const cleanRow = {};
    for (const key of Object.keys(row)) {
      cleanRow[key] = sanitizeCellText(row[key]);
    }
    return cleanRow;
  });
  const worksheet = XLSX.utils.json_to_sheet(sanitizedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Data");
  XLSX.writeFile(workbook, `${filename}-${todayLocal()}.xlsx`);
}

/**
 * Export professional branded PDF report for PT Mahameru Insan Mandiri
 */
export function exportToPDF({ title, subtitle, headers, data, filename }) {
  const doc = new jsPDF("landscape", "pt", "a4");

  // Header banner
  doc.setFillColor(10, 37, 64); // Navy #0A2540
  doc.rect(0, 0, 842, 60, "F");

  // Gold accent bar
  doc.setFillColor(197, 160, 89); // Gold #C5A059
  doc.rect(0, 60, 842, 4, "F");

  // Company branding
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("PT MAHAMERU INSAN MANDIRI", 40, 35);

  doc.setFontSize(10);
  doc.setTextColor(197, 160, 89);
  doc.text("DISTRIBUTION MANAGEMENT SYSTEM", 802, 35, { align: "right" });

  // Report Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 37, 64);
  doc.text(title || "DMS MAHAMERU — LAPORAN OPERASIONAL", 40, 88);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 40, 103);
  }

  // Generation timestamp
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 802, 103, { align: "right" });

  // Compute column styles based on header names
  const columnStyles = {};
  headers.forEach((h, index) => {
    const keyLower = String(h.key || "").toLowerCase();
    const labelLower = String(h.label || "").toLowerCase();

    if (h.isMoney || keyLower.includes("nilai") || keyLower.includes("harga") || keyLower.includes("revenue") || keyLower.includes("subtotal")) {
      columnStyles[index] = { halign: "right" };
    } else if (keyLower.includes("qty") || keyLower.includes("volume") || keyLower.includes("jumlah") || keyLower.includes("target") || keyLower.includes("actual")) {
      columnStyles[index] = { halign: "right" };
    } else if (keyLower.includes("rincian") || labelLower.includes("rincian") || keyLower.includes("detail") || keyLower.includes("items")) {
      columnStyles[index] = {
        cellWidth: 160,
        overflow: "linebreak",
        valign: "top",
        fontSize: 7.5,
      };
    } else if (keyLower.includes("status") || keyLower.includes("tanggal") || keyLower.includes("date") || keyLower.includes("code") || keyLower.includes("kode")) {
      columnStyles[index] = { halign: "center" };
    }
  });

  // Table rows with multi-line formatting support
  const tableRows = data.map((row) =>
    headers.map((h) => {
      const rawVal = row[h.key];
      if (typeof rawVal === "number" && h.isMoney) return rupiah(rawVal);
      if (typeof rawVal === "number") return rawVal.toLocaleString("id-ID");
      const clean = sanitizeCellText(rawVal ?? "-");
      return String(clean);
    })
  );

  autoTable(doc, {
    startY: subtitle ? 116 : 102,
    head: [headers.map((h) => h.label)],
    body: tableRows,
    theme: "striped",
    styles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 4,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [10, 37, 64],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      valign: "middle",
      halign: "center",
      cellPadding: 5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    margin: { left: 35, right: 35 },
    didDrawPage: (data) => {
      // Footer page number
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Halaman ${data.pageNumber}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 18,
        { align: "center" }
      );
    },
  });

  doc.save(`${filename || "DMS_Mahameru_Report"}-${todayLocal()}.pdf`);
}
