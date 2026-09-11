import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const HOD_MASTER_MAPPING = {
  CSE: {
    name: 'Dr. S. Mercy Shalinie',
    personalEmail: 'shalinie@tce.edu',
    hodEmail: 'hodcse@tce.edu',
    aliases: ['smscse@tce.edu', 'shalinie@tce.edu', 'hodcse@tce.edu'],
    designation: 'Professor, Head and Dean (MIS)'
  },
  ECE: {
    name: 'Dr. B. Manimegalai',
    personalEmail: 'naveenmegaa@tce.edu',
    hodEmail: 'hodece@tce.edu',
    aliases: ['bmece@tce.edu', 'naveenmegaa@tce.edu', 'hodece@tce.edu'],
    designation: 'Professor & Head'
  },
  IT: {
    name: 'Dr. C. Deisy',
    personalEmail: 'cdcse@tce.edu',
    hodEmail: 'hodit@tce.edu',
    aliases: ['cdit@tce.edu', 'cdcse@tce.edu', 'hodit@tce.edu'],
    designation: 'Professor & Head'
  },
  EEE: {
    name: 'Dr. M. Saravanan',
    personalEmail: 'mseee@tce.edu',
    hodEmail: 'hodeee@tce.edu',
    aliases: ['vseee@tce.edu', 'mseee@tce.edu', 'hodeee@tce.edu'],
    designation: 'Professor & Head'
  },
  MECH: {
    name: 'Dr. P. Maran',
    personalEmail: 'pmmech@tce.edu',
    hodEmail: 'hodmech@tce.edu',
    aliases: ['pmmech@tce.edu', 'hodmech@tce.edu'],
    designation: 'Professor & Head I/c'
  },
  CIVIL: {
    name: 'Dr. S. Arul Mary',
    personalEmail: 'samciv@tce.edu',
    hodEmail: 'hodciv@tce.edu',
    aliases: ['samciv@tce.edu', 'hodciv@tce.edu'],
    designation: 'Professor & Head'
  },
  MECT: {
    name: 'Dr. G. Kumaraguruparan',
    personalEmail: 'gkgmech@tce.edu',
    hodEmail: 'hodmect@tce.edu',
    aliases: ['gkgmech@tce.edu', 'hodmect@tce.edu'],
    designation: 'Associate Professor & Head'
  },
  CSBS: {
    name: 'Dr. M. K. Kavitha Devi',
    personalEmail: 'mkkdit@tce.edu',
    hodEmail: 'hodcsbs@tce.edu',
    aliases: ['mkkdit@tce.edu', 'hodcsbs@tce.edu'],
    designation: 'Professor & Head'
  },
  MCA: {
    name: 'Dr. P. Chitra',
    personalEmail: 'pccse@tce.edu',
    hodEmail: 'hodca@tce.edu',
    aliases: ['pchitracse@tce.edu', 'pccse@tce.edu', 'hodca@tce.edu'],
    designation: 'Professor & Head'
  },
  ARCH: {
    name: 'Dr. J. Jinu Louishidha Kitchley',
    personalEmail: 'jinujoshua@tce.edu',
    hodEmail: 'hodarch@tce.edu',
    aliases: ['jjkarch@tce.edu', 'jinujoshua@tce.edu', 'hodarch@tce.edu'],
    designation: 'Professor & Head (T\'SEDA)'
  },
  MATH: {
    name: 'Dr. A. Anitha',
    personalEmail: 'anithavalli@tce.edu',
    hodEmail: 'hodmat@tce.edu',
    aliases: ['aaamat@tce.edu', 'anithavalli@tce.edu', 'hodmat@tce.edu'],
    designation: 'Associate Professor & Head I/c'
  },
  AMCS: {
    name: 'Dr. S. Parthasarathy',
    personalEmail: 'spcse@tce.edu',
    hodEmail: 'hodamcs@tce.edu',
    aliases: ['sps@tce.edu', 'spcse@tce.edu', 'hodamcs@tce.edu'],
    designation: 'Professor & Head'
  },
  PHY: {
    name: 'Dr. M. Mahendran',
    personalEmail: 'manickam-mahendran@tce.edu',
    hodEmail: 'hodphy@tce.edu',
    aliases: ['manickam-mahendran@tce.edu', 'hodphy@tce.edu'],
    designation: 'Professor & Head'
  },
  CHEM: {
    name: 'Dr. V. Velkannan',
    personalEmail: 'velkannan@tce.edu',
    hodEmail: 'hodchem@tce.edu',
    aliases: ['vvchem@tce.edu', 'velkannan@tce.edu', 'hodchem@tce.edu'],
    designation: 'Associate Professor & Head I/c'
  },
  ENG: {
    name: 'Dr. G. Jeya Jeevakani',
    personalEmail: 'gjjeng@tce.edu',
    hodEmail: 'hodeng@tce.edu',
    aliases: ['gjjeng@tce.edu', 'hodeng@tce.edu'],
    designation: 'Assistant Professor & Head I/c'
  },
  AI: {
    name: 'Dr. S. Padmavathi',
    personalEmail: 'spmcse@tce.edu',
    hodEmail: 'hodai@tce.edu',
    aliases: ['spmcse@tce.edu', 'hodai@tce.edu'],
    designation: 'Associate Professor & Head I/c'
  }
};

async function alignDirectory() {
  console.log('🔄 Starting Dual-Email Directory Alignment Process...\n');

  const jsonPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.json');
  const rawData = fs.readFileSync(jsonPath, 'utf8');
  let facultyList = JSON.parse(rawData);

  console.log(`📋 Total records loaded: ${facultyList.length}`);

  // 1. Process and align each faculty entry
  const alignedFaculty = [];

  for (const deptCode of Object.keys(HOD_MASTER_MAPPING)) {
    const hodInfo = HOD_MASTER_MAPPING[deptCode];

    // Find if HoD is already in the list
    let hodEntry = facultyList.find(f => 
      f.department === deptCode && (
        f.name.toLowerCase().includes(hodInfo.name.toLowerCase().replace('dr. ', '').split(' ')[1] || '---') ||
        f.email === hodInfo.hodEmail ||
        f.email === hodInfo.personalEmail ||
        f.role === 'HOD'
      )
    );

    if (hodEntry) {
      hodEntry.name = hodInfo.name;
      hodEntry.personalEmail = hodInfo.personalEmail;
      hodEntry.email = hodInfo.personalEmail; // authoritative personal login
      hodEntry.hodEmail = hodInfo.hodEmail;   // official departmental role email
      hodEntry.alternateEmails = hodInfo.aliases;
      hodEntry.role = 'HOD';
      hodEntry.designation = hodInfo.designation;
    }
  }

  // Align regular faculty records
  facultyList = facultyList.map(f => {
    const hodConfig = HOD_MASTER_MAPPING[f.department];
    const isThisHod = hodConfig && (
      f.email === hodConfig.hodEmail || 
      f.email === hodConfig.personalEmail || 
      hodConfig.aliases.includes(f.email) ||
      f.name.toLowerCase().includes(hodConfig.name.toLowerCase().replace('dr. ', '').trim())
    );

    if (isThisHod) {
      return {
        staffId: f.staffId || hodConfig.personalEmail.split('@')[0].toUpperCase(),
        name: hodConfig.name,
        designation: hodConfig.designation,
        email: hodConfig.personalEmail,
        personalEmail: hodConfig.personalEmail,
        hodEmail: hodConfig.hodEmail,
        alternateEmails: hodConfig.aliases,
        department: f.department,
        departmentName: f.departmentName,
        role: 'HOD',
        photo: f.photo || '',
        profileUrl: f.profileUrl || '',
        source: 'tce.edu'
      };
    } else {
      const personalMail = f.email.startsWith('hod') ? `${f.staffId.toLowerCase()}@tce.edu` : f.email;
      return {
        staffId: f.staffId,
        name: f.name,
        designation: f.designation,
        email: personalMail,
        personalEmail: personalMail,
        hodEmail: '',
        alternateEmails: [personalMail],
        department: f.department,
        departmentName: f.departmentName,
        role: 'Faculty',
        photo: f.photo || '',
        profileUrl: f.profileUrl || '',
        source: 'tce.edu'
      };
    }
  });

  // Deduplicate by personalEmail within same department
  const uniqueMap = new Map();
  for (const f of facultyList) {
    const key = `${f.department}_${f.email}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, f);
    }
  }

  const finalizedList = Array.from(uniqueMap.values());
  console.log(`✓ Deduplicated & Aligned Total Records: ${finalizedList.length}`);

  // 2. Save Updated JSON
  fs.writeFileSync(jsonPath, JSON.stringify(finalizedList, null, 2), 'utf-8');
  console.log(`✓ Saved Aligned JSON: ${jsonPath}`);

  // 3. Generate Formatted Excel (.xlsx) with Distinct Dual Email Columns
  const excelRows = finalizedList.map((f, idx) => ({
    'S.No': idx + 1,
    'Staff ID': f.staffId,
    'Faculty Name': f.name,
    'Designation': f.designation,
    'Department Code': f.department,
    'Department Name': f.departmentName,
    'Personal / Faculty Email': f.personalEmail,
    'Department HoD Email': f.hodEmail || '—',
    'Active Role': f.role,
    'Profile URL': f.profileUrl
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TCE Faculty Directory');

  worksheet['!cols'] = [
    { wch: 6 },   // S.No
    { wch: 12 },  // Staff ID
    { wch: 32 },  // Faculty Name
    { wch: 35 },  // Designation
    { wch: 16 },  // Dept Code
    { wch: 40 },  // Dept Name
    { wch: 32 },  // Personal Email
    { wch: 26 },  // HoD Email
    { wch: 14 },  // Role
    { wch: 45 }   // Profile URL
  ];

  const xlsxPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.xlsx');
  XLSX.writeFile(workbook, xlsxPath);
  console.log(`✓ Generated Formatted Dual-Email Excel: ${xlsxPath}`);

  // 4. Generate CSV
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);
  const csvPath = path.join(__dirname, '..', 'server', 'data', 'tce_faculty_directory.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log(`✓ Generated Formatted Dual-Email CSV: ${csvPath}`);

  // 5. Sync to MongoDB Atlas Cloud
  const mongoUri = process.env.MONGO_URI;
  if (mongoUri) {
    console.log('\n⏳ Connecting to MongoDB Atlas to synchronize dual-email fields...');
    await mongoose.connect(mongoUri);
    
    // Drop existing or upsert cleanly
    const FacultyMember = mongoose.model('FacultyMember', new mongoose.Schema({}, { strict: false }));
    
    const bulkOps = finalizedList.map(item => ({
      updateOne: {
        filter: { 
          $or: [
            { email: item.email.toLowerCase().trim() },
            { personalEmail: item.personalEmail?.toLowerCase().trim() },
            ...(item.hodEmail ? [{ hodEmail: item.hodEmail.toLowerCase().trim() }] : [])
          ]
        },
        update: {
          $set: {
            staffId: item.staffId || '',
            name: item.name,
            designation: item.designation || 'Faculty',
            email: item.email.toLowerCase().trim(),
            personalEmail: item.personalEmail.toLowerCase().trim(),
            hodEmail: item.hodEmail ? item.hodEmail.toLowerCase().trim() : '',
            alternateEmails: item.alternateEmails || [item.email.toLowerCase().trim()],
            department: item.department || 'CSE',
            departmentName: item.departmentName || '',
            role: item.role || 'Faculty',
            photo: item.photo || '',
            profileUrl: item.profileUrl || '',
            active: true
          }
        },
        upsert: true
      }
    }));

    await FacultyMember.bulkWrite(bulkOps, { ordered: false });
    const count = await FacultyMember.countDocuments();
    console.log(`✅ MongoDB Atlas Synchronized: ${count} faculty members with dual-email support!`);
    await mongoose.disconnect();
  }

  console.log('\n🎉 Dual-Email Alignment Complete!');
}

alignDirectory().catch(console.error);
