// Script to generate db/postgres/init/002_university_demo.sql
const fs = require('fs');
const path = require('path');

const firstNames = [
  'Liam', 'Olivia', 'Noah', 'Emma', 'Oliver', 'Ava', 'Elijah', 'Charlotte', 'William', 'Sophia',
  'James', 'Amelia', 'Benjamin', 'Isabella', 'Lucas', 'Mia', 'Henry', 'Evelyn', 'Alexander', 'Harper',
  'Mason', 'Camila', 'Michael', 'Gianna', 'Ethan', 'Abigail', 'Daniel', 'Luna', 'Jacob', 'Ella',
  'Logan', 'Elizabeth', 'Jackson', 'Sofia', 'Levi', 'Emily', 'Sebastian', 'Avery', 'Mateo', 'Mila',
  'Jack', 'Aria', 'Owen', 'Scarlett', 'Theodore', 'Penelope', 'Aiden', 'Chloe', 'Samuel', 'Layla',
  'Joseph', 'Victoria', 'John', 'Madison', 'David', 'Eleanor', 'Wyatt', 'Grace', 'Matthew', 'Nora',
  'Luke', 'Hazel', 'Asher', 'Zoey', 'Carter', 'Riley', 'Julian', 'Stella', 'Grayson', 'Aurora',
  'Leo', 'Natalie', 'Jayden', 'Emilia', 'Gabriel', 'Everly', 'Isaac', 'Leah', 'Lincoln', 'Aubrey',
  'Anthony', 'Willow', 'Hudson', 'Addison', 'Dylan', 'Lucy', 'Ezra', 'Audrey', 'Thomas', 'Bella',
  'Charles', 'Nova', 'Christopher', 'Brooklyn', 'Jaxon', 'Paisley', 'Maverick', 'Savannah', 'Josiah', 'Claire'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

const departments = [
  { code: 'CS', name: 'Computer Science', building: 'Turing Hall', budget: 1250000.00, year: 1982 },
  { code: 'EE', name: 'Electrical Engineering', building: 'Tesla Building', budget: 1100000.00, year: 1975 },
  { code: 'MATH', name: 'Mathematics & Statistics', building: 'Euler Annex', budget: 850000.00, year: 1968 },
  { code: 'PHYS', name: 'Physics', building: 'Fermi Laboratory', budget: 950000.00, year: 1970 },
  { code: 'BIO', name: 'Biological Sciences', building: 'Darwin Complex', budget: 1050000.00, year: 1985 },
  { code: 'BUS', name: 'Business & Management', building: 'Sloan Wing', budget: 1400000.00, year: 1990 }
];

const professorTitles = ['Assistant Professor', 'Associate Professor', 'Full Professor', 'Distinguished Professor'];

const professors = [
  { deptId: 1, first: 'Alan', last: 'Turing', title: 'Distinguished Professor', salary: 145000, hire: '2012-08-15' },
  { deptId: 1, first: 'Grace', last: 'Hopper', title: 'Full Professor', salary: 138000, hire: '2014-01-10' },
  { deptId: 1, first: 'Donald', last: 'Knuth', title: 'Full Professor', salary: 142000, hire: '2015-08-20' },
  { deptId: 2, first: 'Nikola', last: 'Tesla', title: 'Distinguished Professor', salary: 140000, hire: '2011-09-01' },
  { deptId: 2, first: 'Claude', last: 'Shannon', title: 'Full Professor', salary: 135000, hire: '2016-08-15' },
  { deptId: 3, first: 'Leonhard', last: 'Euler', title: 'Full Professor', salary: 132000, hire: '2013-01-15' },
  { deptId: 3, first: 'Ada', last: 'Lovelace', title: 'Associate Professor', salary: 118000, hire: '2018-08-20' },
  { deptId: 4, first: 'Richard', last: 'Feynman', title: 'Distinguished Professor', salary: 146000, hire: '2010-07-01' },
  { deptId: 4, first: 'Marie', last: 'Curie', title: 'Full Professor', salary: 144000, hire: '2013-09-01' },
  { deptId: 5, first: 'Charles', last: 'Darwin', title: 'Full Professor', salary: 130000, hire: '2015-01-10' },
  { deptId: 5, first: 'Rosalind', last: 'Franklin', title: 'Associate Professor', salary: 122000, hire: '2019-08-15' },
  { deptId: 6, first: 'Adam', last: 'Smith', title: 'Full Professor', salary: 136000, hire: '2014-09-01' },
  { deptId: 6, first: 'Elinor', last: 'Ostrom', title: 'Associate Professor', salary: 125000, hire: '2017-08-20' }
];

const courseDefs = [
  { deptId: 1, profId: 1, code: 'CS101', title: 'Introduction to Computer Science', credits: 4, cap: 45, sem: 'Fall 2026' },
  { deptId: 1, profId: 2, code: 'CS201', title: 'Data Structures and Algorithms', credits: 4, cap: 40, sem: 'Fall 2026' },
  { deptId: 1, profId: 3, code: 'CS301', title: 'Database Management Systems', credits: 4, cap: 35, sem: 'Fall 2026' },
  { deptId: 1, profId: 1, code: 'CS340', title: 'Operating Systems Internals', credits: 4, cap: 30, sem: 'Spring 2026' },
  { deptId: 1, profId: 2, code: 'CS450', title: 'Distributed Systems Architecture', credits: 3, cap: 28, sem: 'Spring 2026' },
  { deptId: 2, profId: 4, code: 'EE101', title: 'Circuit Analysis Fundamentals', credits: 4, cap: 40, sem: 'Fall 2026' },
  { deptId: 2, profId: 5, code: 'EE205', title: 'Digital Signals & Systems', credits: 3, cap: 35, sem: 'Fall 2026' },
  { deptId: 2, profId: 4, code: 'EE310', title: 'Microcontroller Architecture', credits: 4, cap: 30, sem: 'Spring 2026' },
  { deptId: 3, profId: 6, code: 'MATH150', title: 'Calculus I: Single Variable', credits: 4, cap: 50, sem: 'Fall 2026' },
  { deptId: 3, profId: 6, code: 'MATH220', title: 'Linear Algebra & Matrices', credits: 3, cap: 45, sem: 'Fall 2026' },
  { deptId: 3, profId: 7, code: 'MATH310', title: 'Probability & Statistics', credits: 3, cap: 40, sem: 'Fall 2026' },
  { deptId: 3, profId: 7, code: 'MATH380', title: 'Discrete Mathematics', credits: 3, cap: 35, sem: 'Spring 2026' },
  { deptId: 4, profId: 8, code: 'PHYS201', title: 'Classical Mechanics & Waves', credits: 4, cap: 40, sem: 'Fall 2026' },
  { deptId: 4, profId: 9, code: 'PHYS202', title: 'Electricity and Magnetism', credits: 4, cap: 35, sem: 'Fall 2026' },
  { deptId: 4, profId: 8, code: 'PHYS350', title: 'Quantum Mechanics Primer', credits: 3, cap: 25, sem: 'Spring 2026' },
  { deptId: 5, profId: 10, code: 'BIO101', title: 'Cellular & Molecular Biology', credits: 4, cap: 45, sem: 'Fall 2026' },
  { deptId: 5, profId: 11, code: 'BIO230', title: 'Genetics and Genomics', credits: 4, cap: 35, sem: 'Fall 2026' },
  { deptId: 5, profId: 10, code: 'BIO340', title: 'Ecology & Evolutionary Biology', credits: 3, cap: 30, sem: 'Spring 2026' },
  { deptId: 6, profId: 12, code: 'BUS101', title: 'Principles of Microeconomics', credits: 3, cap: 50, sem: 'Fall 2026' },
  { deptId: 6, profId: 13, code: 'BUS210', title: 'Financial Accounting', credits: 3, cap: 45, sem: 'Fall 2026' },
  { deptId: 6, profId: 12, code: 'BUS320', title: 'Corporate Finance & Strategy', credits: 3, cap: 35, sem: 'Spring 2026' },
  { deptId: 6, profId: 13, code: 'BUS360', title: 'Operations & Supply Chain', credits: 3, cap: 35, sem: 'Spring 2026' }
];

let sql = `-- ==============================================================================
-- DBFlow University Management System Demonstration Schema & Dataset
-- Database: dbflow_demo
-- Target Engine: PostgreSQL 14+
-- ==============================================================================

-- Drop tables in reverse foreign key order for clean reproducibility
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS professors CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- 1. Departments Table
CREATE TABLE departments (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code varchar(10) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  building varchar(60) NOT NULL,
  budget numeric(12, 2) NOT NULL CHECK (budget >= 0),
  established_year integer NOT NULL CHECK (established_year BETWEEN 1800 AND 2026)
);

-- 2. Professors Table
CREATE TABLE professors (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  first_name varchar(50) NOT NULL,
  last_name varchar(50) NOT NULL,
  email varchar(120) NOT NULL UNIQUE,
  phone varchar(25),
  hire_date date NOT NULL,
  title varchar(60) NOT NULL CHECK (title IN ('Assistant Professor', 'Associate Professor', 'Full Professor', 'Distinguished Professor')),
  salary numeric(10, 2) NOT NULL CHECK (salary >= 30000)
);

-- 3. Students Table
CREATE TABLE students (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  first_name varchar(50) NOT NULL,
  last_name varchar(50) NOT NULL,
  email varchar(120) NOT NULL UNIQUE,
  gpa numeric(3, 2) CHECK (gpa BETWEEN 0.00 AND 4.00),
  enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'probation', 'graduated', 'leave'))
);

-- 4. Courses Table
CREATE TABLE courses (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  professor_id integer NOT NULL REFERENCES professors (id) ON DELETE RESTRICT,
  course_code varchar(20) NOT NULL UNIQUE,
  title varchar(120) NOT NULL,
  credits integer NOT NULL CHECK (credits BETWEEN 1 AND 6),
  max_capacity integer NOT NULL DEFAULT 40 CHECK (max_capacity > 0),
  semester varchar(30) NOT NULL
);

-- 5. Enrollments Table (Many-to-Many junction between Students & Courses)
CREATE TABLE enrollments (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id integer NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id integer NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
  grade numeric(5, 2) CHECK (grade BETWEEN 0.00 AND 100.00),
  status varchar(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'dropped', 'failed')),
  UNIQUE (student_id, course_id)
);

-- 6. Attendance Table
CREATE TABLE attendance (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enrollment_id integer NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
  class_date date NOT NULL,
  status varchar(15) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  remarks varchar(255)
);

-- 7. Assignments Table
CREATE TABLE assignments (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id integer NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,
  max_points integer NOT NULL DEFAULT 100 CHECK (max_points > 0),
  due_date timestamptz NOT NULL,
  weight_pct numeric(4, 1) NOT NULL CHECK (weight_pct BETWEEN 0 AND 100)
);

-- 8. Submissions Table
CREATE TABLE submissions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id integer NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  score numeric(5, 2) CHECK (score >= 0),
  feedback text,
  UNIQUE (assignment_id, student_id)
);

-- ==============================================================================
-- Seed Data
-- ==============================================================================

-- Seed Departments
INSERT INTO departments (code, name, building, budget, established_year) VALUES
${departments.map(d => `  ('${d.code}', '${d.name}', '${d.building}', ${d.budget.toFixed(2)}, ${d.year})`).join(',\n')};

-- Seed Professors
INSERT INTO professors (department_id, first_name, last_name, email, phone, hire_date, title, salary) VALUES
${professors.map(p => {
  const email = `${p.first.toLowerCase()}.${p.last.toLowerCase()}@university.edu`;
  const phone = `+1 (555) ${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
  return `  (${p.deptId}, '${p.first}', '${p.last}', '${email}', '${phone}', '${p.hire}', '${p.title}', ${p.salary.toFixed(2)})`;
}).join(',\n')};

-- Seed Courses
INSERT INTO courses (department_id, professor_id, course_code, title, credits, max_capacity, semester) VALUES
${courseDefs.map(c => `  (${c.deptId}, ${c.profId}, '${c.code}', '${c.title}', ${c.credits}, ${c.cap}, '${c.sem}')`).join(',\n')};
`;

// Generate 120 Students
const studentList = [];
let seedCounter = 1;
const usedEmails = new Set();

for (let i = 0; i < 120; i++) {
  const first = firstNames[i % firstNames.length];
  const last = lastNames[(i * 3 + 7) % lastNames.length];
  let email = `${first.toLowerCase()}.${last.toLowerCase()}@student.edu`;
  if (usedEmails.has(email)) {
    email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@student.edu`;
  }
  usedEmails.add(email);

  const deptId = (i % departments.length) + 1;
  // GPA between 2.40 and 3.98
  const gpa = (2.4 + (Math.sin(i * 1.5) + 1) * 0.78).toFixed(2);
  const year = 2023 + (i % 4);
  const month = String((i % 12) + 1).padStart(2, '0');
  const day = String((i % 28) + 1).padStart(2, '0');
  const enrollDate = `${year}-${month}-${day}`;
  const status = i === 12 ? 'probation' : i > 110 ? 'graduated' : i === 45 ? 'leave' : 'active';
  studentList.push({ id: i + 1, deptId, first, last, email, gpa, enrollDate, status });
}

sql += `
-- Seed Students (120 records)
INSERT INTO students (department_id, first_name, last_name, email, gpa, enrollment_date, status) VALUES
${studentList.map(s => `  (${s.deptId}, '${s.first}', '${s.last}', '${s.email}', ${s.gpa}, '${s.enrollDate}', '${s.status}')`).join(',\n')};
`;

// Generate Enrollments (300+ records)
const enrollmentList = [];
let enrollId = 1;
const enrollmentSet = new Set();

for (let sId = 1; sId <= 120; sId++) {
  const student = studentList[sId - 1];
  // Enroll student in 2 to 4 courses, prioritizing courses in their department
  const deptCourses = courseDefs.map((c, idx) => ({ ...c, id: idx + 1 })).filter(c => c.deptId === student.deptId);
  const otherCourses = courseDefs.map((c, idx) => ({ ...c, id: idx + 1 })).filter(c => c.deptId !== student.deptId);

  const chosen = [
    deptCourses[sId % deptCourses.length].id,
    deptCourses[(sId + 1) % deptCourses.length].id,
    otherCourses[(sId * 2) % otherCourses.length].id
  ];
  if (sId % 2 === 0 && otherCourses.length > 1) {
    chosen.push(otherCourses[(sId * 3) % otherCourses.length].id);
  }

  for (const cId of chosen) {
    const key = `${sId}-${cId}`;
    if (!enrollmentSet.has(key)) {
      enrollmentSet.add(key);
      const gradeVal = 62 + (Math.cos(sId + cId) + 1) * 18.5;
      const grade = gradeVal > 98 ? '98.50' : gradeVal.toFixed(2);
      const status = gradeVal < 60 ? 'failed' : (sId % 25 === 0) ? 'dropped' : (sId % 5 === 0) ? 'completed' : 'enrolled';
      enrollmentList.push({ id: enrollId++, sId, cId, grade, status });
    }
  }
}

sql += `
-- Seed Enrollments (${enrollmentList.length} records)
INSERT INTO enrollments (student_id, course_id, enrollment_date, grade, status) VALUES
${enrollmentList.map(e => `  (${e.sId}, ${e.cId}, '2026-08-25', ${e.grade}, '${e.status}')`).join(',\n')};
`;

// Generate Attendance (500 records)
const attendanceList = [];
const dates = ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'];
const statuses = ['present', 'present', 'present', 'present', 'present', 'late', 'absent', 'excused'];

for (let i = 0; i < Math.min(500, enrollmentList.length * 2); i++) {
  const enroll = enrollmentList[i % enrollmentList.length];
  const classDate = dates[i % dates.length];
  const st = statuses[(i * 7 + enroll.sId) % statuses.length];
  const remark = st === 'late' ? "'Arrived 15 mins late'" : st === 'excused' ? "'Medical certificate provided'" : "NULL";
  attendanceList.push({ eId: enroll.id, date: classDate, status: st, remark });
}

sql += `
-- Seed Attendance (${attendanceList.length} records)
INSERT INTO attendance (enrollment_id, class_date, status, remarks) VALUES
${attendanceList.map(a => `  (${a.eId}, '${a.date}', '${a.status}', ${a.remark})`).join(',\n')};
`;

// Generate Assignments (2 per course = 44 assignments)
const assignmentList = [];
let assignId = 1;
for (let cId = 1; cId <= courseDefs.length; cId++) {
  const course = courseDefs[cId - 1];
  assignmentList.push({
    id: assignId++,
    cId,
    title: `${course.code} Midterm Project`,
    points: 100,
    due: '2026-10-25 23:59:00+00',
    weight: 25.0
  });
  assignmentList.push({
    id: assignId++,
    cId,
    title: `${course.code} Laboratory Assignment 1`,
    points: 50,
    due: '2026-09-30 23:59:00+00',
    weight: 15.0
  });
}

sql += `
-- Seed Assignments (${assignmentList.length} records)
INSERT INTO assignments (course_id, title, max_points, due_date, weight_pct) VALUES
${assignmentList.map(a => `  (${a.cId}, '${a.title}', ${a.points}, '${a.due}', ${a.weight})`).join(',\n')};
`;

// Generate Submissions for enrolled students
const submissionList = [];
const subSet = new Set();

for (const a of assignmentList) {
  // Find enrollments for this course
  const courseEnrollments = enrollmentList.filter(e => e.cId === a.cId);
  for (const enr of courseEnrollments) {
    if (enr.status !== 'dropped') {
      const key = `${a.id}-${enr.sId}`;
      if (!subSet.has(key)) {
        subSet.add(key);
        const score = Math.min(a.points, (a.points * 0.65 + (Math.sin(a.id + enr.sId) + 1) * (a.points * 0.17))).toFixed(2);
        const feedback = Number(score) > a.points * 0.9 ? "'Exceptional solution and documentation.'" : Number(score) > a.points * 0.75 ? "'Good effort, check edge case handling.'" : "'Requires revision on core concepts.'";
        submissionList.push({
          aId: a.id,
          sId: enr.sId,
          score,
          feedback
        });
      }
    }
  }
}

sql += `
-- Seed Submissions (${submissionList.length} records)
INSERT INTO submissions (assignment_id, student_id, submitted_at, score, feedback) VALUES
${submissionList.map(s => `  (${s.aId}, ${s.sId}, '2026-09-29 18:30:00+00', ${s.score}, ${s.feedback})`).join(',\n')};
`;

const outputPath = path.join(__dirname, '..', 'db', 'postgres', 'init', '002_university_demo.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`Generated ${outputPath} successfully (${(sql.length / 1024).toFixed(1)} KB)`);
