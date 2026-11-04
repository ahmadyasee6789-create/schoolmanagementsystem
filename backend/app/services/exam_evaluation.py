# app/services/exam_evaluation.py

def evaluate_result(subjects):
    total_marks = sum(s["total"] for s in subjects)
    obtained_marks = sum(s["obtained"] for s in subjects)

    if not subjects or total_marks <= 0:
        raise ValueError("Valid exam marks are required")

    percentage = (obtained_marks / total_marks) * 100

    failed_count = sum(
        1 for subject in subjects
        if subject["obtained"] < subject["pass"]
    )

    passed = percentage >= 40 and failed_count < 3

    return {
        "percentage": round(percentage, 2),
        "failed_count": failed_count,
        "result": "PASSED" if passed else "FAILED",
    }