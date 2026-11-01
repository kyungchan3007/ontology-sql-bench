# 스키마 — hr.db

- DB: SQLite `hr.db`
- 날짜는 `YYYY-MM-DD` 문자열

```sql
CREATE TABLE departments (
  dept_cd     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  level       INTEGER NOT NULL,
  parent_cd   TEXT REFERENCES departments(dept_cd),
  active      INTEGER NOT NULL,
  closed_date TEXT
);

CREATE TABLE employees (
  emp_no    TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  hire_date TEXT NOT NULL,
  end_date  TEXT,
  status    TEXT NOT NULL,
  grade_cd  TEXT NOT NULL,
  dept_old  TEXT
);

CREATE TABLE emp_depts (
  emp_no     TEXT NOT NULL REFERENCES employees(emp_no),
  dept_cd    TEXT NOT NULL REFERENCES departments(dept_cd),
  is_primary INTEGER NOT NULL,
  from_date  TEXT NOT NULL,
  to_date    TEXT
);

CREATE TABLE salaries (
  emp_no         TEXT NOT NULL REFERENCES employees(emp_no),
  effective_from TEXT NOT NULL,
  amount_k       INTEGER NOT NULL,
  PRIMARY KEY (emp_no, effective_from)
);

CREATE TABLE evaluations (
  emp_no TEXT NOT NULL REFERENCES employees(emp_no),
  year   INTEGER NOT NULL,
  rating TEXT NOT NULL,
  PRIMARY KEY (emp_no, year)
);

CREATE TABLE absences (
  emp_no    TEXT NOT NULL REFERENCES employees(emp_no),
  from_date TEXT NOT NULL,
  to_date   TEXT NOT NULL,
  reason_cd TEXT NOT NULL
);

CREATE TABLE leave_grants (
  emp_no     TEXT NOT NULL REFERENCES employees(emp_no),
  grant_date TEXT NOT NULL,
  days       REAL NOT NULL
);

CREATE TABLE leave_usages (
  emp_no   TEXT NOT NULL REFERENCES employees(emp_no),
  use_date TEXT NOT NULL,
  unit_cd  TEXT NOT NULL
);

CREATE TABLE workdays (
  date       TEXT PRIMARY KEY,
  is_workday INTEGER NOT NULL
);
```
