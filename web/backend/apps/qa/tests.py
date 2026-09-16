from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.users.models import Role
from apps.qa.models import QASession, QAMessage, QASessionShare
from apps.cases.models import Case, Patient

User = get_user_model()


class QASystemTests(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username="student_test",
            email="student_test@example.com",
            password="Password123!",
            role=Role.STUDENT,
            first_name="Văn A",
            last_name="Nguyễn",
        )
        self.doctor = User.objects.create_user(
            username="doctor_test",
            email="doctor_test@example.com",
            password="Password123!",
            role=Role.DOCTOR,
            first_name="Thầy B",
            last_name="Trần",
        )
        self.other_student = User.objects.create_user(
            username="student_other",
            email="student_other@example.com",
            password="Password123!",
            role=Role.STUDENT,
            first_name="Văn C",
            last_name="Lê",
        )

    def test_student_can_create_qa_session_with_box_and_initial_message(self):
        self.client.force_authenticate(user=self.student)
        payload = {
            "title": "Hỏi về vùng răng 21 bị viêm nặng",
            "image_url": "/media/cases/1/annotated_0.jpg",
            "initial_content": "Thưa thầy, vùng này có phải là viêm cấp tính không ạ?",
            "bounding_box": {
                "x": 0.45,
                "y": 0.32,
                "width": 0.12,
                "height": 0.15,
                "label": "Răng 21",
            },
            "box_comment": "Vùng lợi sưng đỏ quanh chân răng 21",
            "share_with_user_ids": [self.doctor.id],
        }
        res = self.client.post("/api/qa/sessions/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        session_id = res.data["id"]

        session = QASession.objects.get(pk=session_id)
        self.assertEqual(session.title, "Hỏi về vùng răng 21 bị viêm nặng")
        self.assertEqual(session.created_by, self.student)
        self.assertEqual(session.messages.count(), 1)
        self.assertTrue(
            QASessionShare.objects.filter(session=session, shared_with=self.doctor).exists()
        )

        msg = session.messages.first()
        self.assertEqual(msg.sender, self.student)
        self.assertEqual(msg.bounding_box["label"], "Răng 21")
        self.assertEqual(msg.box_comment, "Vùng lợi sưng đỏ quanh chân răng 21")

    def test_doctor_can_reply_and_resolve_session(self):
        # Create session by student
        session = QASession.objects.create(
            title="Phiên chẩn đoán mảng bám",
            created_by=self.student,
            image_url="/media/cases/1/annotated_0.jpg",
        )
        QAMessage.objects.create(
            session=session,
            sender=self.student,
            content="Xin ý kiến thầy về răng 11",
        )
        QASessionShare.objects.create(
            session=session,
            shared_with=self.doctor,
            shared_by=self.student,
        )

        # Doctor replies
        self.client.force_authenticate(user=self.doctor)
        res = self.client.post(
            f"/api/qa/sessions/{session.id}/messages/",
            {
                "content": "Chào em, đây là viêm nướu mức độ 2, cần hướng dẫn bệnh nhân vệ sinh kẽ răng.",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(session.messages.count(), 2)

        # Doctor updates status to resolved
        res_update = self.client.patch(
            f"/api/qa/sessions/{session.id}/",
            {"status": "resolved"},
            format="json",
        )
        self.assertEqual(res_update.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.status, "resolved")

    def test_diagnosis_question_is_saved_for_student_and_selected_doctor(self):
        """Phiên thật phải xuất hiện ở màn hỏi đáp của cả hai vai trò."""
        self.client.force_authenticate(user=self.student)
        create_res = self.client.post(
            "/api/qa/sessions/",
            {
                "title": "Hỏi về kết quả chẩn đoán · Ca #12 · Ảnh 1",
                "image_url": "/media/cases/12/annotated_0.jpg",
                "initial_content": "Nhờ thầy xem giúp vùng AI vừa đánh dấu ạ.",
                "share_with_user_ids": [self.doctor.id],
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        session_id = create_res.data["id"]

        student_list = self.client.get("/api/qa/sessions/", {"scope": "mine"})
        self.assertEqual(student_list.status_code, 200)
        self.assertIn(session_id, [item["id"] for item in student_list.data])

        self.client.force_authenticate(user=self.doctor)
        doctor_list = self.client.get("/api/qa/sessions/", {"scope": "all"})
        self.assertEqual(doctor_list.status_code, 200)
        self.assertIn(session_id, [item["id"] for item in doctor_list.data])

        reply_res = self.client.post(
            f"/api/qa/sessions/{session_id}/messages/",
            {"content": "Thầy đã xem kết quả; em cần đối chiếu thêm dấu hiệu lâm sàng."},
            format="json",
        )
        self.assertEqual(reply_res.status_code, 201)

        self.client.force_authenticate(user=self.student)
        detail_res = self.client.get(f"/api/qa/sessions/{session_id}/")
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(len(detail_res.data["messages"]), 2)
        self.assertEqual(detail_res.data["messages"][-1]["sender"]["id"], self.doctor.id)

    def test_student_must_select_at_least_one_teacher(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.post(
            "/api/qa/sessions/",
            {"title": "Câu hỏi chưa chọn giảng viên", "initial_content": "Nhờ giải đáp ạ"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("share_with_user_ids", res.data)

    def test_student_can_list_registered_active_doctors_as_teachers(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.get("/api/qa/sessions/teachers/")

        self.assertEqual(res.status_code, 200)
        teacher_ids = [item["id"] for item in res.data]
        self.assertIn(self.doctor.id, teacher_ids)

    def test_unselected_doctor_cannot_read_student_session(self):
        other_doctor = User.objects.create_user(
            username="doctor_other",
            email="doctor_other@example.com",
            password="Password123!",
            role=Role.DOCTOR,
        )
        session = QASession.objects.create(title="Hỏi riêng giảng viên", created_by=self.student)
        QASessionShare.objects.create(
            session=session,
            shared_with=self.doctor,
            shared_by=self.student,
        )

        self.client.force_authenticate(user=other_doctor)
        res = self.client.get(f"/api/qa/sessions/{session.id}/")
        self.assertEqual(res.status_code, 404)

    def test_sharing_qa_session_with_another_student(self):
        session = QASession.objects.create(
            title="Phiên thảo luận nhóm",
            created_by=self.student,
        )
        self.client.force_authenticate(user=self.student)
        res = self.client.post(
            f"/api/qa/sessions/{session.id}/share/",
            {"user_ids": [self.other_student.id]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(
            QASessionShare.objects.filter(session=session, shared_with=self.other_student).exists()
        )

        # Other student can now view the session
        self.client.force_authenticate(user=self.other_student)
        res_detail = self.client.get(f"/api/qa/sessions/{session.id}/")
        self.assertEqual(res_detail.status_code, 200)

        # Other student can reply to the session
        res_reply = self.client.post(
            f"/api/qa/sessions/{session.id}/messages/",
            {"content": "Mình cũng gặp trường hợp tương tự này!"},
            format="json",
        )
        self.assertEqual(res_reply.status_code, 201)

    def test_student_cannot_create_qa_session_with_case_without_permission(self):
        """Test rằng sinh viên không thể tạo phiên với ca mà họ không có quyền truy cập."""
        # Create a case owned by doctor
        patient = Patient.objects.create(
            name="Bệnh nhân test",
            patient_code="BP001",
        )
        other_doctor = User.objects.create_user(
            username="doctor_other",
            email="doctor_other@example.com",
            password="Password123!",
            role=Role.DOCTOR,
            first_name="Thầy",
            last_name="Phạm",
        )
        case = Case.objects.create(
            patient=patient,
            created_by=other_doctor,
        )

        # Student tries to create QA session referencing this case
        self.client.force_authenticate(user=self.student)
        payload = {
            "title": "Hỏi về ca của bác sĩ khác",
            "image_url": "/media/cases/1/annotated_0.jpg",
            "case": case.id,  # Sinh viên cố tạo session với case không được phép truy cập
            "initial_content": "Thưa thầy...",
            "share_with_user_ids": [self.doctor.id],
        }
        res = self.client.post("/api/qa/sessions/", payload, format="json")
        # Nên nhận lỗi 400 validation error
        self.assertEqual(res.status_code, 400)
        self.assertIn("case", res.data)
