import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const facultyList = JSON.parse(rawData);

// Map to clean table format
const tableData = facultyList.map((f, index) => ({
  'S.No': index + 1,
  'Staff ID': f.staffId,
  'Faculty Name': f.name,
  'Designation': f.designation,
  'Department Code': f.department,
  'Department Name': f.departmentName,
  'Official Email': f.email,
  'Role': f.role,
  'Profile Link': f.profileUrl
}));

// 1. Generate Excel (.xlsx)
const worksheet = XLSX.utils.json_to_sheet(tableData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'TCE Faculty Directory');

// Auto-adjust column widths
const colWidths = [
  { wch: 6 },
  { wch: 12 },
  { wch: 30 },
  { wch: 35 },
  { wch: 15 },
  { wch: 40 },
  { wch: 30 },
  { wch: 10 },
  { wch: 50 }
];
worksheet['!cols'] = colWidths;

const xlsxPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.xlsx');
XLSX.writeFile(workbook, xlsxPath);
console.log(`✓ Generated Excel Directory: ${xlsxPath}`);

// 2. Generate CSV (.csv)
const csvContent = XLSX.utils.sheet_to_csv(worksheet);
const csvPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.csv');
fs.writeFileSync(csvPath, csvContent, 'utf8');
console.log(`✓ Generated CSV Directory: ${csvPath}`);
