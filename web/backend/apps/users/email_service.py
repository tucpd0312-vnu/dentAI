import threading

from django.conf import settings
from django.core.mail import send_mail


def send_otp_email(user, code: str, purpose: str) -> None:
    """
    Gửi OTP qua email.
    purpose: 'verify' / 'reset'
    Chạy trong thread riêng để không block response.
    """
    if purpose == "verify":
        subject = "[DentAI] Mã xác thực tài khoản"
        body = (
            f"Xin chào {user.username},\n\n"
            f"Mã xác thực email của bạn là: {code}\n\n"
            f"Mã có hiệu lực trong 10 phút.\n\n"
            f"Trân trọng,\nDentAI Team"
        )
    else:
        subject = "[DentAI] Mã đặt lại mật khẩu"
        body = (
            f"Xin chào {user.username},\n\n"
            f"Mã đặt lại mật khẩu của bạn là: {code}\n\n"
            f"Mã có hiệu lực trong 10 phút.\n\n"
            f"Trân trọng,\nDentAI Team"
        )

    threading.Thread(
        target=_send,
        args=(subject, body, user.email),
        daemon=True,
    ).start()


def _send(subject: str, body: str, to_email: str):
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=True,
        )
    except Exception:
        pass