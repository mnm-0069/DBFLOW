// Pre-configured demonstration queries for university and commerce schemas.

export type DemoQuery = {
  id: string;
  title: string;
  description: string;
  category: 'Overview' | 'Analytics' | 'Joins' | 'Aggregations';
  sql: string;
};

export const DEMO_QUERIES: DemoQuery[] = [
  {
    id: 'dept-overview',
    title: 'Department Faculty & Student Overview',
    description: 'Counts total faculty and active students per academic department',
    category: 'Overview',
    sql: `SELECT 
  d.code AS dept_code,
  d.name AS department_name,
  d.building,
  d.budget,
  COUNT(DISTINCT p.id) AS faculty_count,
  COUNT(DISTINCT s.id) AS student_count
FROM departments d
LEFT JOIN professors p ON p.department_id = d.id
LEFT JOIN students s ON s.department_id = d.id
GROUP BY d.id, d.code, d.name, d.building, d.budget
ORDER BY student_count DESC;`
  },
  {
    id: 'course-capacity',
    title: 'Course Enrollment & Capacity Utilization',
    description: 'Calculates enrollment percentage and available seats per course',
    category: 'Analytics',
    sql: `SELECT 
  c.course_code,
  c.title AS course_title,
  d.code AS dept_code,
  p.last_name AS professor,
  c.credits,
  c.max_capacity,
  COUNT(e.id) AS enrolled_students,
  ROUND((COUNT(e.id)::numeric / c.max_capacity::numeric) * 100, 1) AS capacity_pct
FROM courses c
JOIN departments d ON c.department_id = d.id
JOIN professors p ON c.professor_id = p.id
LEFT JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.course_code, c.title, d.code, p.last_name, c.credits, c.max_capacity
ORDER BY enrolled_students DESC;`
  },
  {
    id: 'top-students',
    title: 'Top Performing Students by GPA',
    description: 'Lists active students with highest GPAs and enrolled course counts',
    category: 'Joins',
    sql: `SELECT 
  s.id AS student_id,
  s.first_name || ' ' || s.last_name AS student_name,
  s.email,
  d.name AS department,
  s.gpa,
  COUNT(e.id) AS courses_enrolled,
  ROUND(AVG(e.grade), 2) AS average_grade
FROM students s
JOIN departments d ON s.department_id = d.id
LEFT JOIN enrollments e ON e.student_id = s.id
WHERE s.status = 'active'
GROUP BY s.id, s.first_name, s.last_name, s.email, d.name, s.gpa
ORDER BY s.gpa DESC
LIMIT 20;`
  },
  {
    id: 'course-grades',
    title: 'Course Grade Distribution Analysis',
    description: 'Evaluates average, min, and max grades, with pass/fail counts',
    category: 'Aggregations',
    sql: `SELECT 
  c.course_code,
  c.title,
  COUNT(e.id) AS total_enrolled,
  ROUND(AVG(e.grade), 2) AS avg_grade,
  MIN(e.grade) AS min_grade,
  MAX(e.grade) AS max_grade,
  COUNT(CASE WHEN e.grade >= 70 THEN 1 END) AS passed_count,
  COUNT(CASE WHEN e.grade < 70 THEN 1 END) AS failed_count
FROM courses c
JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.course_code, c.title
ORDER BY avg_grade DESC;`
  },
  {
    id: 'attendance-rates',
    title: 'Attendance Rates by Course',
    description: 'Computes overall student attendance and presence percentages',
    category: 'Analytics',
    sql: `SELECT 
  c.course_code,
  c.title,
  COUNT(a.id) AS total_records,
  COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present_count,
  COUNT(CASE WHEN a.status = 'late' THEN 1 END) AS late_count,
  COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS absent_count,
  ROUND((COUNT(CASE WHEN a.status = 'present' THEN 1 END)::numeric / NULLIF(COUNT(a.id), 0)::numeric) * 100, 1) AS attendance_rate_pct
FROM courses c
JOIN enrollments e ON e.course_id = c.id
JOIN attendance a ON a.enrollment_id = e.id
GROUP BY c.id, c.course_code, c.title
ORDER BY attendance_rate_pct DESC;`
  },
  {
    id: 'commerce-orders',
    title: 'Customer Order Totals (Sample Store)',
    description: 'Summarizes purchase volume for the sample store dataset',
    category: 'Overview',
    sql: `SELECT 
  c.full_name,
  c.city,
  COUNT(o.id) AS order_count,
  COALESCE(SUM(o.total), 0) AS total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.full_name, c.city
ORDER BY total_spent DESC;`
  }
];
