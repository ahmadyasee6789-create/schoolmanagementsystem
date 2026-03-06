from pydantic import BaseModel
class ClassroomCreate(BaseModel):
    section:str

class AssignTeacherRequest(BaseModel):
    teacher_id: int