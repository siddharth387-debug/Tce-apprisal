import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://www.tce.edu';

const DEPARTMENTS = [
  { name: 'Computer Science and Engineering', code: 'CSE', path: '/academics/departments/computer-science-engineering/faculty' },
  { name: 'Information Technology', code: 'IT', path: '/academics/departments/information-technology/faculty' },
  { name: 'Electronics and Communication Engineering', code: 'ECE', path: '/academics/departments/electronics-and-communication-engineering/faculty' },
  { name: 'Electrical and Electronics Engineering', code: 'EEE', path: '/academics/departments/electrical-and-electronics-engineering/faculty' },
  { name: 'Mechanical Engineering', code: 'MECH', path: '/academics/departments/mechanical-engineering/faculty' },
  { name: 'Civil Engineering', code: 'CIVIL', path: '/academics/departments/civil-engineering/faculty' },
  { name: 'Mechatronics', code: 'MECT', path: '/academics/departments/mechatronics/faculty' },
  { name: 'Computer Science and Business Systems', code: 'CSBS', path: '/academics/departments/computer-science-and-business-system/faculty' },
  { name: 'Computer Applications', code: 'MCA', path: '/academics/departments/computer-applications/faculty' },
  { name: 'Artificial Intelligence and Data Science', code: 'AI', path: '/academics/departments/artificial-intelligence/faculty' },
  { name: 'Applied Mathematics and Computational Science', code: 'AMCS', path: '/academics/departments/data-science/faculty' },
  { name: 'Architecture (T\'SEDA)', code: 'ARCH', path: '/academics/departments/architecture/faculty' },
  { name: 'Mathematics', code: 'MATH', path: '/academics/departments/mathematics/faculty' },
  { name: 'Physics', code: 'PHY', path: '/academics/departments/physics/faculty' },
  { name: 'Chemistry', code: 'CHEM', path: '/academics/departments/chemistry/faculty' },
  { name: 'English', code: 'ENG', path: '/academics/departments/english/faculty' },
  { name: 'Fashion Technology', code: 'FT', path: '/academics/departments/fashion-technology/faculty' }
];

function cleanEmail(rawEmail) {
  if (!rawEmail) return '';
  let email = rawEmail
    .replace(/\[at\]/gi, '@')
    .replace(/\[dot\]/gi, '.')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
  
  if (email && !email.includes('@')) {
    email += '@tce.edu';
  }
  return email;
}

function parseFacultyCards(html, dept) {
  const facultyList = [];
  const facultyBlocks = html.split('<div class="item-columns">');
  
  for (let i = 1; i < facultyBlocks.length; i++) {
    const block = facultyBlocks[i];
    
    // Extract name
    const nameMatch = block.match(/views-field-field-staffname">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i) ||
                      block.match(/views-field-title">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i);
    const desigMatch = block.match(/views-field-field-designation">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i);
    const emailMatch = block.match(/views-field-field-email">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i);
    const imgMatch = block.match(/<img [^>]*src="([^"]+)"/i);
    const profileMatch = block.match(/href="(\/staff_profile\/[^"]+)"/i);

    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim();
      const designation = desigMatch ? desigMatch[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim() : 'Faculty';
      const rawEmail = emailMatch ? emailMatch[1].trim() : '';
      const email = cleanEmail(rawEmail);
      const photo = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE_URL}${imgMatch[1]}`) : '';
      const profileUrl = profileMatch ? `${BASE_URL}${profileMatch[1]}` : '';

      const staffId = email ? email.split('@')[0].toUpperCase() : name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10).toUpperCase();

      const isHod = designation.toLowerCase().includes('head') || 
                    designation.toLowerCase().includes('hod') ||
                    email.startsWith('hod');

      if (name.length > 2 && !name.toLowerCase().includes('view profile')) {
        facultyList.push({
          staffId,
          name,
          designation,
          email: email || `${staffId.toLowerCase()}@tce.edu`,
          department: dept.code,
          departmentName: dept.name,
          role: isHod ? 'HOD' : 'Faculty',
          photo,
          profileUrl,
          source: 'tce.edu'
        });
      }
    }
  }

  return facultyList;
}

async function scrapeAll() {
  console.log('🚀 Starting TCE Faculty Directory Scraper...\n');
  const allFaculty = [];
  const deptSummary = {};

  for (const dept of DEPARTMENTS) {
    const url = `${BASE_URL}${dept.path}`;
    try {
      console.log(`📡 Fetching ${dept.code} (${dept.name}) from ${url}...`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      const faculty = parseFacultyCards(response.data, dept);
      console.log(`   ✓ Found ${faculty.length} faculty members for ${dept.code}`);
      
      deptSummary[dept.code] = faculty.length;
      allFaculty.push(...faculty);
    } catch (err) {
      console.error(`   ❌ Failed to fetch ${dept.code}: ${err.message}`);
    }
  }

  // Also fetch HOD page to ensure all HODs are accurately captured
  try {
    console.log(`\n📡 Fetching master HOD directory from ${BASE_URL}/academics/hod...`);
    const hodRes = await axios.get(`${BASE_URL}/academics/hod`, { timeout: 15000 });
    const hodList = parseFacultyCards(hodRes.data, { code: 'HOD', name: 'Heads of Departments' });
    console.log(`   ✓ Found ${hodList.length} HoD records from HOD page.`);

    // Cross-reference and update role=HOD in allFaculty or add if missing
    for (const hod of hodList) {
      const match = allFaculty.find(f => f.name.toLowerCase() === hod.name.toLowerCase() || f.email === hod.email);
      if (match) {
        match.role = 'HOD';
        if (hod.email) match.email = hod.email;
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Could not fetch HOD page: ${err.message}`);
  }

  console.log(`\n🎉 Total Faculty Records Scraped: ${allFaculty.length}`);
  console.log('📊 Department Breakdown:', deptSummary);

  const outDir = path.join(__dirname, '..', 'server', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'tce_faculty_directory.json');
  fs.writeFileSync(outFile, JSON.stringify(allFaculty, null, 2), 'utf-8');
  console.log(`\n💾 Saved structured master directory to: ${outFile}`);
}

scrapeAll().catch(console.error);
