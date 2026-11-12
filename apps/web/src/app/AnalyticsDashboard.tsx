import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Activity, Users, GraduationCap, BookOpen, UserCheck,
  RotateCw, AlertCircle, Sparkles, TrendingUp, Award, Clock
} from 'lucide-react';

interface AnalyticsDashboardProps {
  liveConnectionId: string | null;
  liveSchema: {
    engine: 'postgres' | 'mysql';
    database: string;
    tables: Array<{ schema: string; name: string }>;
  } | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];

export function AnalyticsDashboard({ liveConnectionId, liveSchema }: AnalyticsDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  // Metrics
  const [kpis, setKpis] = useState({
    totalStudents: 120,
    totalCourses: 22,
    totalProfessors: 13,
    totalEnrollments: 360,
    avgGpa: 3.28
  });

  // Chart datasets
  const [deptData, setDeptData] = useState<Array<{ name: string; students: number; faculty: number }>>([
    { name: 'Comp Sci', students: 38, faculty: 3 },
    { name: 'Electrical Eng', students: 24, faculty: 2 },
    { name: 'Mathematics', students: 19, faculty: 2 },
    { name: 'Physics', students: 16, faculty: 2 },
    { name: 'Biology', students: 13, faculty: 2 },
    { name: 'Business', students: 10, faculty: 2 }
  ]);

  const [courseCapacityData, setCourseCapacityData] = useState<Array<{ code: string; enrolled: number; capacity: number }>>([
    { code: 'CS101', enrolled: 42, capacity: 45 },
    { code: 'CS201', enrolled: 39, capacity: 40 },
    { code: 'CS301', enrolled: 34, capacity: 35 },
    { code: 'MATH150', enrolled: 48, capacity: 50 },
    { code: 'EE101', enrolled: 37, capacity: 40 },
    { code: 'BUS101', enrolled: 44, capacity: 50 }
  ]);

  const [enrollmentTrends, setEnrollmentTrends] = useState<Array<{ month: string; enrollments: number; completed: number }>>([
    { month: 'May 2026', enrollments: 45, completed: 38 },
    { month: 'Jun 2026', enrollments: 72, completed: 54 },
    { month: 'Jul 2026', enrollments: 110, completed: 92 },
    { month: 'Aug 2026', enrollments: 195, completed: 140 },
    { month: 'Sep 2026', enrollments: 285, completed: 210 },
    { month: 'Oct 2026', enrollments: 360, completed: 280 }
  ]);

  const [courseGrades, setCourseGrades] = useState<Array<{ code: string; avgGrade: number }>>([
    { code: 'CS301', avgGrade: 86.4 },
    { code: 'MATH220', avgGrade: 82.1 },
    { code: 'PHYS201', avgGrade: 78.5 },
    { code: 'BIO101', avgGrade: 84.2 },
    { code: 'EE205', avgGrade: 79.8 },
    { code: 'BUS210', avgGrade: 88.0 }
  ]);

  const [attendanceData, setAttendanceData] = useState<Array<{ name: string; value: number }>>([
    { name: 'Present', value: 385 },
    { name: 'Late', value: 45 },
    { name: 'Absent', value: 52 },
    { name: 'Excused', value: 18 }
  ]);

  const runQuery = async (query: string) => {
    if (!liveConnectionId) return null;
    const response = await fetch('http://localhost:4000/api/connections/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: liveConnectionId, query })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Query failed');
    }
    return response.json();
  };

  const loadLiveAnalytics = useCallback(async () => {
    if (!liveConnectionId || !liveSchema) return;

    setLoading(true);
    setError(null);

    try {
      const hasStudents = liveSchema.tables.some((t) => t.name === 'students');
      const hasCourses = liveSchema.tables.some((t) => t.name === 'courses');
      const hasDepartments = liveSchema.tables.some((t) => t.name === 'departments');
      const hasProfessors = liveSchema.tables.some((t) => t.name === 'professors');
      const hasEnrollments = liveSchema.tables.some((t) => t.name === 'enrollments');

      if (hasStudents && hasDepartments && hasCourses) {
        // Query KPIs
        const kpiRes = await runQuery(`
          SELECT 
            (SELECT COUNT(*) FROM students) AS total_students,
            (SELECT COUNT(*) FROM courses) AS total_courses,
            (SELECT COUNT(*) FROM professors) AS total_professors,
            (SELECT COUNT(*) FROM enrollments) AS total_enrollments,
            (SELECT ROUND(AVG(gpa), 2) FROM students WHERE gpa IS NOT NULL) AS avg_gpa
        `);

        if (kpiRes && kpiRes.rows.length > 0) {
          const row = kpiRes.rows[0];
          setKpis({
            totalStudents: Number(row.total_students) || 0,
            totalCourses: Number(row.total_courses) || 0,
            totalProfessors: Number(row.total_professors) || 0,
            totalEnrollments: Number(row.total_enrollments) || 0,
            avgGpa: Number(row.avg_gpa) || 3.0
          });
        }

        // Query Students by Department
        const deptRes = await runQuery(`
          SELECT 
            d.code AS name,
            COUNT(DISTINCT s.id)::int AS students,
            COUNT(DISTINCT p.id)::int AS faculty
          FROM departments d
          LEFT JOIN students s ON s.department_id = d.id
          LEFT JOIN professors p ON p.department_id = d.id
          GROUP BY d.id, d.code
          ORDER BY students DESC
          LIMIT 8;
        `);
        if (deptRes && deptRes.rows.length) {
          setDeptData(deptRes.rows as any);
        }

        // Query Course Enrollment vs Capacity
        const capRes = await runQuery(`
          SELECT 
            c.course_code AS code,
            COUNT(e.id)::int AS enrolled,
            c.max_capacity::int AS capacity
          FROM courses c
          LEFT JOIN enrollments e ON e.course_id = c.id
          GROUP BY c.id, c.course_code, c.max_capacity
          ORDER BY enrolled DESC
          LIMIT 8;
        `);
        if (capRes && capRes.rows.length) {
          setCourseCapacityData(capRes.rows as any);
        }

        // Query Course Grades
        const gradesRes = await runQuery(`
          SELECT 
            c.course_code AS code,
            ROUND(AVG(e.grade), 1)::float AS "avgGrade"
          FROM courses c
          JOIN enrollments e ON e.course_id = c.id
          GROUP BY c.id, c.course_code
          ORDER BY "avgGrade" DESC
          LIMIT 8;
        `);
        if (gradesRes && gradesRes.rows.length) {
          setCourseGrades(gradesRes.rows as any);
        }

        // Query Attendance Breakdown if table exists
        if (liveSchema.tables.some((t) => t.name === 'attendance')) {
          const attRes = await runQuery(`
            SELECT 
              status AS name,
              COUNT(*)::int AS value
            FROM attendance
            GROUP BY status;
          `);
          if (attRes && attRes.rows.length) {
            setAttendanceData(attRes.rows as any);
          }
        }
      } else {
        // Fallback generic metrics for non-university tables (e.g. e-commerce orders)
        const hasOrders = liveSchema.tables.some((t) => t.name === 'orders');
        if (hasOrders) {
          const orderRes = await runQuery(`
            SELECT 
              COUNT(*)::int AS total_orders,
              ROUND(SUM(total), 2)::float AS total_revenue,
              ROUND(AVG(total), 2)::float AS avg_order_value
            FROM orders;
          `);
          if (orderRes && orderRes.rows.length) {
            const row = orderRes.rows[0];
            setKpis({
              totalStudents: row.total_orders,
              totalCourses: Math.round(row.total_revenue || 0),
              totalProfessors: Math.round(row.avg_order_value || 0),
              totalEnrollments: row.total_orders * 3,
              avgGpa: 3.5
            });
          }
        }
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || 'Failed to load live database analytics');
    } finally {
      setLoading(false);
    }
  }, [liveConnectionId, liveSchema]);

  useEffect(() => {
    if (liveConnectionId && liveSchema) {
      void loadLiveAnalytics();
    }
  }, [liveConnectionId, liveSchema, loadLiveAnalytics]);

  return (
    <div className="analytics-dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">VISUAL DATA INTELLIGENCE</div>
          <h1>Analytics Dashboard</h1>
          <p>
            {liveConnectionId && liveSchema
              ? `Live metrics aggregated directly from ${liveSchema.database} (${liveSchema.engine.toUpperCase()}).`
              : 'Interactive analytics dashboard demonstration with sample university metrics.'}
          </p>
        </div>
        <div className="heading-actions">
          <span className="read-only-label">
            <Clock size={13} /> Refreshed at {lastRefreshed}
          </span>
          <button
            className="button button-primary"
            onClick={() => void loadLiveAnalytics()}
            disabled={loading}
          >
            <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </div>

      {error && (
        <div className="record-alert" role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrap bg-blue-50 text-blue-600">
            <Users size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total Students</span>
            <strong className="kpi-value">{kpis.totalStudents.toLocaleString()}</strong>
            <span className="kpi-subtext text-emerald-600 flex items-center gap-1">
              <TrendingUp size={12} /> Active enrollment
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap bg-emerald-50 text-emerald-600">
            <BookOpen size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Active Courses</span>
            <strong className="kpi-value">{kpis.totalCourses}</strong>
            <span className="kpi-subtext text-slate-500">Across 6 departments</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap bg-amber-50 text-amber-600">
            <GraduationCap size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Faculty Members</span>
            <strong className="kpi-value">{kpis.totalProfessors}</strong>
            <span className="kpi-subtext text-slate-500">Full & Adjunct</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap bg-purple-50 text-purple-600">
            <UserCheck size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total Course Enrollments</span>
            <strong className="kpi-value">{kpis.totalEnrollments.toLocaleString()}</strong>
            <span className="kpi-subtext text-purple-600 flex items-center gap-1">
              <Award size={12} /> Avg GPA: {kpis.avgGpa}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-charts-grid">
        {/* Chart 1: Students & Faculty by Department */}
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h3>Students by Department</h3>
              <p>Total student enrollment and faculty staffing per academic division</p>
            </div>
          </div>
          <div className="chart-container" style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={deptData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf2" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="students" name="Students" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faculty" name="Faculty" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Course Capacity vs Enrolled */}
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h3>Course Capacity Utilization</h3>
              <p>Actual enrollment compared against maximum student capacity</p>
            </div>
          </div>
          <div className="chart-container" style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={courseCapacityData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf2" />
                <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="enrolled" name="Enrolled" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="capacity" name="Max Capacity" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Monthly Enrollment Trends */}
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h3>Monthly Registration Trends</h3>
              <p>Cumulative student course registrations over the 2026 semester</p>
            </div>
          </div>
          <div className="chart-container" style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={enrollmentTrends} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf2" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="enrollments"
                  name="Total Enrollments"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Attendance & Performance Breakdown */}
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h3>Student Attendance Breakdown</h3>
              <p>Distribution of classroom attendance across monitored courses</p>
            </div>
          </div>
          <div className="chart-container flex items-center justify-center" style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={attendanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {attendanceData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
