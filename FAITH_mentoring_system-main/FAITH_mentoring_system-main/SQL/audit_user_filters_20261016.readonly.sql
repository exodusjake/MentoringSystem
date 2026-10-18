-- READ-ONLY: the values the Admin User Management filters compare against.
SET NOCOUNT ON;

-- Mentees: school, course and department as stored
SELECT u.UserID, u.FirstName + ' ' + u.LastName AS Mentee, u.IsActive, u.Gender,
       mp.School, mp.Course, mp.Department, mp.DepartmentID, d.DepartmentName AS DeptFromID
FROM dbo.Users u
JOIN dbo.MenteeProfiles mp ON mp.UserID = u.UserID
LEFT JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
WHERE u.Role = 'Mentee'
ORDER BY mp.School, mp.Course;

-- Mentors: school and department
SELECT u.UserID, u.FirstName + ' ' + u.LastName AS Mentor, u.IsActive, u.Gender,
       mp.School, mp.Department, mp.DepartmentID, d.DepartmentName AS DeptFromID
FROM dbo.Users u
JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
LEFT JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
WHERE u.Role = 'Mentor'
ORDER BY mp.School;

-- Gender values in use, and accounts per role/active state
SELECT Role, IsActive, ISNULL(Gender, '(none)') AS Gender, COUNT(*) AS Accounts
FROM dbo.Users GROUP BY Role, IsActive, Gender ORDER BY Role, IsActive, Gender;
