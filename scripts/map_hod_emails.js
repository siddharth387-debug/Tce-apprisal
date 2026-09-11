import axios from 'axios';

const BASE_URL = 'https://www.tce.edu';

const depts = [
  { code: 'CIVIL', name: 'Civil Engineering', path: '/academics/departments/civil-engineering/faculty', hod: 'Arul Mary', hodMail: 'hodciv@tce.edu' },
  { code: 'MECH', name: 'Mechanical Engineering', path: '/academics/departments/mechanical-engineering/faculty', hod: 'Maran', hodMail: 'hodmech@tce.edu' },
  { code: 'EEE', name: 'Electrical & Electronics Engineering', path: '/academics/departments/electrical-and-electronics-engineering/faculty', hod: 'Saravanan', hodMail: 'hodeee@tce.edu' },
  { code: 'ECE', name: 'Electronics & Communication Engineering', path: '/academics/departments/electronics-and-communication-engineering/faculty', hod: 'Manimegalai', hodMail: 'hodece@tce.edu' },
  { code: 'CSE', name: 'Computer Science & Engineering', path: '/academics/departments/computer-science-engineering/faculty', hod: 'Shalinie', hodMail: 'hodcse@tce.edu' },
  { code: 'IT', name: 'Information Technology', path: '/academics/departments/information-technology/faculty', hod: 'Deisy', hodMail: 'hodit@tce.edu' },
  { code: 'MECT', name: 'Mechatronics', path: '/academics/departments/mechatronics/faculty', hod: 'Kumaraguruparan', hodMail: 'hodmect@tce.edu' },
  { code: 'CSBS', name: 'Computer Science and Business Systems', path: '/academics/departments/computer-science-and-business-system/faculty', hod: 'Kavitha Devi', hodMail: 'hodcsbs@tce.edu' },
  { code: 'MCA', name: 'Computer Applications', path: '/academics/departments/computer-applications/faculty', hod: 'Chitra', hodMail: 'hodca@tce.edu' },
  { code: 'ARCH', name: 'Architecture (T\'SEDA)', path: '/academics/departments/architecture/faculty', hod: 'Jinu', hodMail: 'hodarch@tce.edu' },
  { code: 'MATH', name: 'Mathematics', path: '/academics/departments/mathematics/faculty', hod: 'Anitha', hodMail: 'hodmat@tce.edu' },
  { code: 'AMCS', name: 'Applied Math & Computational Science', path: '/academics/departments/data-science/faculty', hod: 'Parthasarathy', hodMail: 'hodamcs@tce.edu' },
  { code: 'PHY', name: 'Physics', path: '/academics/departments/physics/faculty', hod: 'Mahendran', hodMail: 'hodphy@tce.edu' },
  { code: 'CHEM', name: 'Chemistry', path: '/academics/departments/chemistry/faculty', hod: 'Velkannan', hodMail: 'hodchem@tce.edu' },
  { code: 'ENG', name: 'English', path: '/academics/departments/english/faculty', hod: 'Jeevakani', hodMail: 'hodeng@tce.edu' },
  { code: 'AI', name: 'Artificial Intelligence', path: '/academics/departments/artificial-intelligence/faculty', hod: 'Padmavathi', hodMail: 'hodai@tce.edu' }
];

async function run() {
  for (const d of depts) {
    try {
      const res = await axios.get(BASE_URL + d.path, { timeout: 10000 });
      const html = res.data;
      const blocks = html.split('<div class="item-columns">');
      let personalMail = '';
      let fullName = '';
      for (const b of blocks) {
        if (b.toLowerCase().includes(d.hod.toLowerCase())) {
          const nameMatch = b.match(/views-field-field-staffname">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i);
          const emailMatch = b.match(/views-field-field-email">\s*<div class="field-content">\s*(.*?)\s*<\/div>/i);
          if (nameMatch) fullName = nameMatch[1];
          if (emailMatch) {
            personalMail = emailMatch[1].replace(/\[at\]/gi, '@').replace(/\[dot\]/gi, '.').replace(/\s+/g, '');
            if (!personalMail.includes('@')) personalMail += '@tce.edu';
          }
        }
      }
      console.log(`${d.code.padEnd(6)} | HoD: ${(fullName || d.hod).padEnd(30)} | Personal: ${(personalMail || 'N/A').padEnd(20)} | HoD Mail: ${d.hodMail}`);
    } catch (e) {
      console.log(`${d.code} fetch error: ${e.message}`);
    }
  }
}

run();
