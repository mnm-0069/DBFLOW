-- ==============================================================================
-- DBFlow Demonstration Queries — University Management System
-- Useful for SQL Workspace and Analytics testing
-- ==============================================================================

-- Query 1: Department Overview — Faculty count, Student count, and Budget
SELECT 
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
ORDER BY student_count DESC;

-- Query 2: Course Enrollment and Capacity Utilization
SELECT 
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
ORDER BY enrolled_students DESC;

-- Query 3: Student Academic Performance & Department Ranking
SELECT 
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
LIMIT 20;

-- Query 4: Course Grade Analytics (Min, Max, Avg, Passed)
SELECT 
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
ORDER BY avg_grade DESC;

-- Query 5: Attendance Rate by Course
SELECT 
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
ORDER BY attendance_rate_pct DESC;
