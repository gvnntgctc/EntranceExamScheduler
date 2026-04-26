# Entrance Exam Scheduler - System Flowchart & Process Documentation

## 1. AUTHENTICATION PROCESS

```
START
  |
  v
USER ACCESSES WEBSITE
  |
  v
AUTHENTICATION CHECK
  |
  ├─────────────────────────────────────────┐
  |                                         |
  NO SESSION                           YES SESSION
  |                                         |
  v                                         v
REDIRECT TO LOGIN                    CHECK USER ROLE
  |                                         |
  v                                    ├────────────┐
USER ENTERS CREDENTIALS                |            |
  |                                    ADMIN      STUDENT
  ├─ Email                             |            |
  ├─ Password                          |            |
  └─ Submit                            |            |
        |                              |            |
        v                              |            |
   VALIDATE INPUT                      |            |
        |                              |            |
        ├─ Email exists?               |            |
        ├─ Password matches?           |            |
        └─ Role assigned?              |            |
              |                        |            |
              ├─ NO ─────────────┐     |            |
              |                  |     |            |
              |        INVALID CREDENTIALS ERROR   |
              |                  |     |            |
              |                  v     |            |
              |            DISPLAY ERROR MSG       |
              |                  |     |            |
              |                  └─────┼────────────┤
              |                        |            |
              └─ YES ──────────────────┼────────────┤
                                       |            |
                                       v            v
                                   ADMIN HOME   STUDENT HOME
                                   DASHBOARD    DASHBOARD
```

## 2. ADMIN WORKFLOW

```
ADMIN DASHBOARD
  |
  ├──────────────────────────────────┬──────────────────────────┬──────────────┐
  |                                  |                          |              |
  v                                  v                          v              v
EXAM SCHEDULES               MANAGE APPLICANTS        VIEW ANALYTICS      LOGOUT
(WEEKLY/MONTHLY)                   |                                       |
  |                                |                                       v
  ├─ View Calendar            ├─ View All Applicants                   SESSION
  ├─ Add Schedule             |    |                                   DESTROYED
  ├─ Edit Schedule            |    ├─ Display List                     |
  ├─ Delete Schedule          |    ├─ Search/Filter                    v
  └─ View Schedule Details    |    ├─ Pagination                    REDIRECT
                              |    └─ Sort                          TO LOGIN
                              |
                              ├─ View Applicant Details
                              |    |
                              |    ├─ Trigger: Click "View" Button
                              |    ├─ Fetch Student Data (Database)
                              |    ├─ Fetch Related Schedules
                              |    |
                              |    v
                              |   MODAL POPUP
                              |    |
                              |    ├─ Display:
                              |    |   - Full Name
                              |    |   - Email
                              |    |   - Phone Number
                              |    |   - Registration Date
                              |    |   - Assigned Exam Schedules
                              |    |
                              |    └─ Actions:
                              |        - Close Modal (X button)
                              |        - Click Overlay to Close
                              |
                              └─ Delete Applicant
                                   |
                                   ├─ Confirmation Modal
                                   ├─ Delete from Database
                                   ├─ Delete Related Schedules
                                   └─ Redirect & Success Message
```

## 3. SCHEDULE MANAGEMENT PROCESS

```
ADD/EDIT SCHEDULE
  |
  v
FORM INPUT
  ├─ Exam Date (Date Picker)
  ├─ Exam Time (Time Input)
  ├─ Location (Text Input)
  ├─ Select Student (Dropdown)
  └─ Submit
        |
        v
   VALIDATE DATA
        |
        ├─ Date valid?
        ├─ Time format correct?
        ├─ Location not empty?
        └─ Student selected?
              |
              ├─ NO ───────────────────┐
              |                        |
              |          DISPLAY VALIDATION ERRORS
              |                        |
              |                        v
              |                   HIGHLIGHT FIELDS
              |                        |
              |                        v
              |                   USER CORRECTS & RESUBMITS
              |                        |
              |                        └──────────────────────┐
              |                                               |
              └─ YES ────────────────────────────────────────┤
                                                             |
                                                             v
                                              SAVE TO DATABASE
                                                             |
                                                             v
                                              SUCCESS MESSAGE
                                                             |
                                              ┌──────────────┤
                                              |              |
                                          REDIRECT      STAY ON
                                         TO SCHEDULE    SAME PAGE
                                         CALENDAR         |
                                              |           v
                                              |      FORM CLEARED
                                              |           |
                                              └───────────┴─────> NEXT ACTION
```

## 4. APPLICANT MANAGEMENT PROCESS

```
APPLICANTS PAGE LOAD
  |
  v
FETCH ALL APPLICANTS FROM DATABASE
  |
  ├─ Query: User.find({ role: 'student' })
  ├─ Sort: createdAt (newest first)
  └─ Fields: name, email, registered date
        |
        v
   DISPLAY TABLE
        |
        ├─ # | Full Name | Email | Registered | Actions
        |
        v
   USER ACTIONS
        |
        ├──────────┬──────────┐
        |          |          |
        v          v          v
      VIEW      DELETE     SEARCH
       |          |          |
       |          |          v
       |          |      INPUT SEARCH TERM
       |          |          |
       |          |          v
       |          |      FILTER TABLE
       |          |      (Client-side)
       |          |          |
       |          |          v
       |          |      DISPLAY MATCHING
       |          |      RESULTS
       |          |
       |          v
       |      CONFIRMATION DIALOG
       |          |
       |          ├─ Show: "Delete [Name]?"
       |          ├─ Action: Confirm/Cancel
       |          |
       |          ├─ CANCEL ──┐
       |          |           |
       |          |           v
       |          |       CLOSE DIALOG
       |          |           |
       |          |           └──> STAY ON PAGE
       |          |
       |          └─ CONFIRM
       |               |
       |               v
       |           DELETE REQUEST
       |               |
       |               v
       |       DELETE USER FROM DB
       |       DELETE SCHEDULES FROM DB
       |               |
       |               v
       |       REDIRECT & SHOW SUCCESS
       |
       v
   CLICK "VIEW" BUTTON
       |
       v
   ADD QUERY PARAMETER
   (?studentId=...)
       |
       v
   SERVER FETCHES STUDENT DATA
       |
       ├─ User.findById(studentId)
       ├─ Schedule.find({ studentId })
       └─ Render with data
             |
             v
        PAGE DISPLAYS
             |
             v
        MODAL POPUP APPEARS
             |
             v
        USER SEES DETAILS
             |
             └─> Can Close & Return to List
```

## 5. DATA FLOW DIAGRAM

```
┌─────────────┐
│   BROWSER   │
└──────┬──────┘
       |
       | HTTP REQUEST
       v
┌──────────────────────────┐
│   EXPRESS SERVER         │
│  (Node.js Application)   │
└──────┬──────────────────┬┘
       |                 |
       | ROUTE HANDLERS  | MIDDLEWARE
       v                 |
┌──────────────────────┐  |
│  /auth/login         │  |
│  /auth/register      │  |
│  /auth/logout        │  |
│  /admin/students     │  |
│  /admin/schedules    │  |
│  /admin/add-schedule │  |
│  /admin/edit-schedule│  |
│  /admin/delete-*     │  |
│  /student/dashboard  │  |
└──────────┬───────────┘  |
           |              |
           | DATABASE      |
           | OPERATIONS   |
           |              |
           v              |
┌────────────────────────┐ |
│    MONGODB             │ |
│  ┌────────────────────┐│ |
│  │ Users Collection   ││ |
│  │ Schedules Collection
│  │ Sessions           ││ |
│  └────────────────────┘│ |
└────────────┬───────────┘ |
             |            |
             | QUERY/SAVE | VALIDATE
             |            v
             |    ┌────────────────┐
             |    │ AUTHENTICATION │
             |    │ VALIDATION     │
             |    │ AUTHORIZATION  │
             |    └────────────────┘
             |
             v
┌────────────────────────┐
│   RENDER TEMPLATE      │
│   (EJS)                │
└──────┬─────────────────┘
       |
       | HTML + CSS + JS
       v
┌──────────────────────────┐
│   BROWSER RECEIVES       │
│   RENDERS PAGE           │
│   USER INTERACTION       │
└──────────────────────────┘
```

## 6. INPUT/OUTPUT SUMMARY

### INPUTS:
| Module | Input Type | Data Fields |
|--------|-----------|------------|
| **Authentication** | Form Data | Email, Password |
| **Registration** | Form Data | Name, Email, Phone, Password |
| **Add Schedule** | Form Data | Date, Time, Location, Student ID |
| **Edit Schedule** | Form Data | Schedule ID, Date, Time, Location |
| **Search** | Text Input | Search Query |
| **Delete** | Button Click | User/Schedule ID |
| **View Details** | Query Param | Student ID |

### OUTPUTS:
| Module | Output Type | Data |
|--------|-----------|------|
| **Dashboard** | HTML Page | Calendar, Lists, Stats |
| **Student List** | Table HTML | Name, Email, Date, Actions |
| **Student Modal** | Popup | Details, Schedules, Info |
| **Schedule List** | Table HTML | Date, Time, Location, Student |
| **Messages** | Alert/Toast | Success, Error Messages |
| **Redirects** | HTTP | Login, Dashboard, etc. |

## 7. ERROR HANDLING FLOW

```
USER ACTION
  |
  v
VALIDATION CHECK
  |
  ├─ Input validation
  ├─ Authentication check
  ├─ Authorization check
  └─ Database operation
        |
        ├─ SUCCESS ────────────> PROCEED
        |
        └─ ERROR ───────────────┐
                                 |
                                 v
                          CREATE ERROR MESSAGE
                                 |
                                 v
                          LOG ERROR (Console)
                                 |
                                 v
                          DISPLAY TO USER
                                 |
                                 ├─ Validation Errors (Highlight Field)
                                 ├─ Auth Errors (Redirect to Login)
                                 ├─ Server Errors (500 Message)
                                 └─ Not Found (404 Page)
                                 |
                                 v
                          USER TAKES ACTION
                                 |
                                 └─> Retry / Go Back / Fix Input
```

## 8. SESSION & AUTHENTICATION FLOW

```
USER LOGIN
  |
  v
CREDENTIALS VALIDATED
  |
  ├─ User found in DB?
  ├─ Password correct?
  └─ Role assigned?
        |
        ├─ NO ──────────> LOGIN FAILED
        |                   |
        |                   v
        |              REDIRECT TO LOGIN
        |              WITH ERROR
        |
        └─ YES ─────────────────┐
                                 |
                                 v
                          CREATE SESSION
                                 |
                                 ├─ sessionID
                                 ├─ userID
                                 ├─ userRole
                                 └─ timestamp
                                 |
                                 v
                          STORE IN BROWSER COOKIE
                                 |
                                 v
                          REDIRECT TO DASHBOARD
                                 |
                                 v
                          EACH REQUEST
                                 |
                                 ├─ Check session cookie
                                 ├─ Verify session valid
                                 ├─ Check user role
                                 └─ Grant/Deny access
                                 |
                                 v
                          USER LOGOUT
                                 |
                                 ├─ Clear session from server
                                 ├─ Delete browser cookie
                                 └─ Redirect to login
```

---

**Technology Stack:**
- **Frontend:** EJS, HTML, CSS, JavaScript, Bootstrap
- **Backend:** Node.js, Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** Session-based with cookies
- **Server:** localhost:3000

---

This flowchart covers all major processes in your Entrance Exam Scheduler system. Use this for your capstone project documentation!
