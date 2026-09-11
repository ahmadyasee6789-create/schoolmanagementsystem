export type Classroom = {
  id: number;
  section: string;
  grade?: { name: string };
};

export type AttendanceStatus = "present" | "absent";

export type AttendanceStudent = {
  id: number;
  first_name: string;
  last_name: string;
  roll_number?: string;
  status: AttendanceStatus;
  date?: string;
  teacher_name?: string;
};

export type AttendanceRecord = {
  student_id?: number;
  id?: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  roll_number?: string;
  date?: string;
  status: AttendanceStatus;
  teacher_name?: string;
};

export const classLabel = (classroom: Classroom) =>
  classroom.grade ? `${classroom.grade.name} – ${classroom.section}` : classroom.section;

export const studentName = (student: Pick<AttendanceStudent, "first_name" | "last_name">) =>
  `${student.first_name} ${student.last_name}`;
