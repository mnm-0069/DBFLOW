import React, { useState } from 'react';
import {
  GraduationCap, BookOpen, CheckCircle2, ChevronRight,
  Sparkles, KeyRound, Link2, Table2, Code2, ArrowRight,
  TerminalSquare, HelpCircle, Check, X, RotateCcw
} from 'lucide-react';

type LessonId = 'lesson-1' | 'lesson-2' | 'lesson-3';

interface Lesson {
  id: LessonId;
  number: string;
  duration: string;
  title: string;
  concept: string;
  description: string;
  visualSummary: {
    heading: string;
    items: Array<{ title: string; desc: string; icon: any }>;
  };
  sqlExample: string;
  exercise: {
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

const LESSONS: Lesson[] = [
  {
    id: 'lesson-1',
    number: 'LESSON 01',
    duration: '8 MIN',
    title: 'Tables, Columns & Primary Keys',
    concept: 'Relational Organization',
    description:
      'In a relational database, data is partitioned into structured two-dimensional tables. Each row represents a single record, and each column stores a specific attribute with an enforced data type. A Primary Key (PK) uniquely identifies each record and guarantees that no duplicate entries exist.',
    visualSummary: {
      heading: 'Key Principles of Table Design',
      items: [
        {
          title: 'Structured Schema',
          desc: 'Columns declare strict names and data types (e.g. INTEGER, VARCHAR, NUMERIC).',
          icon: Table2
        },
        {
          title: 'Primary Key Uniqueness',
          desc: 'A primary key is non-null and strictly unique across every record in the table.',
          icon: KeyRound
        },
        {
          title: 'Identity & Auto-Increment',
          desc: 'Modern engines use GENERATED ALWAYS AS IDENTITY to automatically generate sequential IDs.',
          icon: Sparkles
        }
      ]
    },
    sqlExample: `-- Creating a robust students table with an identity primary key
CREATE TABLE students (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(50) NOT NULL,
  last_name varchar(50) NOT NULL,
  email varchar(120) NOT NULL UNIQUE,
  gpa numeric(3, 2) CHECK (gpa BETWEEN 0.00 AND 4.00),
  enrollment_date date NOT NULL DEFAULT CURRENT_DATE
);`,
    exercise: {
      prompt: 'Which constraint ensures that no two students can share the exact same student identification number or have an empty ID?',
      options: [
        'FOREIGN KEY',
        'PRIMARY KEY',
        'DEFAULT CURRENT_DATE',
        'CHECK (gpa >= 0)'
      ],
      correctIndex: 1,
      explanation: 'A PRIMARY KEY automatically combines UNIQUE and NOT NULL constraints, ensuring each record has a guaranteed unique, non-empty identifier.'
    }
  },
  {
    id: 'lesson-2',
    number: 'LESSON 02',
    duration: '10 MIN',
    title: 'Foreign Keys & Relationships',
    concept: 'Referential Integrity',
    description:
      'Real-world data is interconnected. A Foreign Key (FK) is a column in one table that references the primary key of another table, establishing a verifiable relationship and preventing orphan records from being created.',
    visualSummary: {
      heading: 'Relationship Cardinalities',
      items: [
        {
          title: '1 : N (One-to-Many)',
          desc: 'A single department has many professors. The foreign key lives on the "many" side.',
          icon: Link2
        },
        {
          title: 'M : N (Many-to-Many)',
          desc: 'Students and Courses connect through an intermediate junction table (Enrollments).',
          icon: BookOpen
        },
        {
          title: 'Cascade Actions',
          desc: 'ON DELETE CASCADE or RESTRICT dictates what happens when a referenced record is removed.',
          icon: ShieldCheckIcon
        }
      ]
    },
    sqlExample: `-- Linking courses to their academic department and assigned professor
CREATE TABLE courses (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  professor_id integer NOT NULL REFERENCES professors (id) ON DELETE RESTRICT,
  course_code varchar(20) NOT NULL UNIQUE,
  title varchar(120) NOT NULL,
  credits integer NOT NULL CHECK (credits BETWEEN 1 AND 6)
);`,
    exercise: {
      prompt: 'If you want to represent a Many-to-Many relationship between Students and Courses, what database construct is required?',
      options: [
        'A single array column inside the Students table',
        'A junction / bridge table with foreign keys referencing both Students and Courses',
        'Adding a duplicate Primary Key to Courses',
        'Using a VARCHAR delimiter'
      ],
      correctIndex: 1,
      explanation: 'Relational databases model Many-to-Many relationships cleanly through a junction table (e.g. "enrollments") containing two foreign keys, one pointing to each related table.'
    }
  },
  {
    id: 'lesson-3',
    number: 'LESSON 03',
    duration: '12 MIN',
    title: 'Your First SQL Relational JOIN',
    concept: 'Data Integration',
    description:
      'The true power of SQL comes from joining related tables at query time. An INNER JOIN matches records where keys align in both tables, while a LEFT JOIN retains all records from the primary table even if no matching foreign record exists.',
    visualSummary: {
      heading: 'Understanding SQL Joins',
      items: [
        {
          title: 'INNER JOIN',
          desc: 'Returns rows only when there is at least one match in both tables.',
          icon: Code2
        },
        {
          title: 'LEFT JOIN',
          desc: 'Returns all rows from the left table, with NULLs for unmatched right columns.',
          icon: TerminalSquare
        },
        {
          title: 'Filtering & Aggregating',
          desc: 'Combine JOINs with GROUP BY and COUNT() to calculate business intelligence metrics.',
          icon: GraduationCap
        }
      ]
    },
    sqlExample: `-- Retrieve course details along with the professor's last name and department code
SELECT 
  c.course_code,
  c.title AS course_title,
  d.code AS dept_code,
  p.last_name AS professor_name,
  c.credits
FROM courses c
JOIN departments d ON c.department_id = d.id
JOIN professors p ON c.professor_id = p.id
ORDER BY c.course_code ASC;`,
    exercise: {
      prompt: 'If a department currently has zero enrolled students, which JOIN type ensures that the department still appears in the output with a count of 0?',
      options: [
        'INNER JOIN',
        'LEFT JOIN (departments LEFT JOIN students)',
        'CROSS JOIN',
        'NATURAL JOIN'
      ],
      correctIndex: 1,
      explanation: 'A LEFT JOIN keeps all rows from the primary left table ("departments") regardless of whether matching records exist in the right table ("students").'
    }
  }
];

function ShieldCheckIcon(props: any) {
  return <Link2 {...props} />;
}

export function LearningSection() {
  const [activeLessonId, setActiveLessonId] = useState<LessonId>('lesson-1');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | null>>({});
  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>({});

  const activeLesson = LESSONS.find((l) => l.id === activeLessonId) || LESSONS[0];

  const handleSelectOption = (lessonId: string, optionIndex: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [lessonId]: optionIndex }));
    const lesson = LESSONS.find((l) => l.id === lessonId);
    if (lesson && optionIndex === lesson.exercise.correctIndex) {
      setCompletedLessons((prev) => ({ ...prev, [lessonId]: true }));
    }
  };

  const progressCount = Object.values(completedLessons).filter(Boolean).length;
  const progressPct = Math.round((progressCount / LESSONS.length) * 100);

  return (
    <div className="learning-experience">
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTERACTIVE DATABASE ACADEMY</div>
          <h1>Learn Relational Databases</h1>
          <p>
            Build intuitive DBMS understanding through visual diagrams, real SQL examples, and instant knowledge checks.
          </p>
        </div>
        <div className="heading-actions">
          <div className="learning-progress-badge">
            <span className="text-xs font-semibold text-slate-600">Course Progress:</span>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <strong className="text-xs text-blue-600 font-semibold">{progressPct}%</strong>
          </div>
        </div>
      </div>

      {/* Lesson Navigation Tabs */}
      <div className="lesson-nav-tabs">
        {LESSONS.map((lesson) => {
          const isActive = lesson.id === activeLessonId;
          const isDone = completedLessons[lesson.id];
          return (
            <button
              key={lesson.id}
              className={`lesson-nav-tab ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
              onClick={() => setActiveLessonId(lesson.id)}
            >
              <div className="tab-status-icon">
                {isDone ? (
                  <CheckCircle2 size={16} className="text-emerald-600" />
                ) : (
                  <span className="tab-num">{lesson.number.slice(-2)}</span>
                )}
              </div>
              <div className="tab-info">
                <span className="tab-meta">{lesson.number} · {lesson.duration}</span>
                <strong className="tab-title">{lesson.title}</strong>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Lesson Content */}
      <div className="lesson-content-card">
        <div className="lesson-header">
          <div className="lesson-kicker">
            <Sparkles size={14} className="text-blue-600" />
            <span>{activeLesson.concept.toUpperCase()}</span>
          </div>
          <h2>{activeLesson.title}</h2>
          <p className="lesson-description">{activeLesson.description}</p>
        </div>

        {/* Visual Principles Grid */}
        <div className="visual-summary-grid">
          {activeLesson.visualSummary.items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div className="summary-item-card" key={idx}>
                <div className="item-icon-box">
                  <Icon size={18} />
                </div>
                <strong>{item.title}</strong>
                <p>{item.desc}</p>
              </div>
            );
          })}
        </div>

        {/* SQL Code Walkthrough */}
        <div className="lesson-sql-section">
          <div className="sql-box-header">
            <div className="flex items-center gap-2">
              <Code2 size={15} className="text-blue-600" />
              <span className="font-semibold text-xs">Production SQL Reference</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">PostgreSQL DDL</span>
          </div>
          <pre className="sql-box-content font-mono">{activeLesson.sqlExample}</pre>
        </div>

        {/* Interactive Knowledge Check Exercise */}
        <div className="lesson-exercise-card">
          <div className="exercise-header">
            <HelpCircle size={16} className="text-amber-600" />
            <h3>Interactive Knowledge Check</h3>
          </div>
          <p className="exercise-prompt">{activeLesson.exercise.prompt}</p>

          <div className="exercise-options">
            {activeLesson.exercise.options.map((option, idx) => {
              const selected = selectedAnswers[activeLesson.id];
              const isSelected = selected === idx;
              const isCorrect = idx === activeLesson.exercise.correctIndex;
              const hasAnswered = selected !== undefined && selected !== null;

              let optionClass = 'exercise-option';
              if (hasAnswered) {
                if (isSelected && isCorrect) optionClass += ' is-correct';
                else if (isSelected && !isCorrect) optionClass += ' is-incorrect';
                else if (isCorrect) optionClass += ' is-correct-hint';
              }

              return (
                <button
                  key={idx}
                  className={optionClass}
                  onClick={() => handleSelectOption(activeLesson.id, idx)}
                  disabled={hasAnswered && isCorrect}
                >
                  <span className="option-marker">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="option-text">{option}</span>
                  {hasAnswered && isSelected && (
                    <span className="option-feedback-icon">
                      {isCorrect ? <Check size={16} className="text-emerald-600" /> : <X size={16} className="text-red-600" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedAnswers[activeLesson.id] !== undefined && selectedAnswers[activeLesson.id] !== null && (
            <div
              className={`exercise-feedback ${
                selectedAnswers[activeLesson.id] === activeLesson.exercise.correctIndex
                  ? 'feedback-success'
                  : 'feedback-error'
              }`}
            >
              <strong>
                {selectedAnswers[activeLesson.id] === activeLesson.exercise.correctIndex
                  ? '✓ Correct Answer!'
                  : '✕ Not quite — let’s review:'}
              </strong>
              <p>{activeLesson.exercise.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
