"""
Deletes every student in your database by calling your existing
DELETE /students/{id} endpoint for each one.

Why do it this way instead of raw SQL: your delete_student() function
already knows how to clean up enrollments (and possibly other related
tables) correctly and safely, scoped to the right org. Re-using it
avoids missing something a hand-written SQL DELETE would miss.

Usage:
    pip install requests
    python delete_all_students.py
"""

import requests

BASE_URL = "http://127.0.0.1:8000"  # change if your backend runs elsewhere
TOKEN = "  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo3LCJleHAiOjE3ODkyMzY3MjB9.7FwLzGP9S1cNcwYbTBtjZrYOntYVbIOG4Z1egBkuVUY"  # the JWT/session token your frontend sends

headers = {"Authorization": f"Bearer {TOKEN}"}


def get_all_student_ids():
    ids = []
    page = 1
    while True:
        resp = requests.get(
            f"{BASE_URL}/students",
            params={"page": page, "limit": 100},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data if isinstance(data, list) else data.get("items", [])
        if not items:
            break
        ids.extend(item["id"] for item in items)
        total_pages = 1 if isinstance(data, list) else data.get("total_pages", 1)
        if page >= total_pages:
            break
        page += 1
    return ids


def main():
    ids = get_all_student_ids()
    print(f"Found {len(ids)} students to delete")

    deleted, failed = 0, 0
    for student_id in ids:
        resp = requests.delete(f"{BASE_URL}/students/{student_id}", headers=headers)
        if resp.status_code == 204:
            deleted += 1
        else:
            failed += 1
            print(f"Failed to delete student {student_id}: {resp.status_code} {resp.text}")

    print(f"Done. Deleted {deleted}, failed {failed}")


if __name__ == "__main__":
    main()