# app/services/exam_evaluation.py

def evaluate_result(subjects):
    total_marks = sum(s["total"] for s in subjects)

    if not subjects or total_marks <= 0:
        raise ValueError("Valid exam marks are required")

    # Preserve existing complete-result calculations; missing marks have no
    # confirmed percentage and must never count as a passing zero.
    if any(s["obtained"] is None for s in subjects):
        return {"percentage": None, "failed_count": sum(s["obtained"] is not None and s["obtained"] < s["pass"] for s in subjects), "result": "INCOMPLETE"}

    obtained_marks = sum(s["obtained"] for s in subjects)

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
