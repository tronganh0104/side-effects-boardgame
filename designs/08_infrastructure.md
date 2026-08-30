# 08 - Infrastructure & Deploy

## 1. Mục tiêu

Hạ tầng phải tách rõ server runtime, frontend static build và Supabase.

## 2. Thành phần

- Server: Node.js + Socket.IO
- Frontend: React build tĩnh
- Auth và storage: Supabase

## 3. Môi trường

- Server giữ secret và config backend
- Client chỉ dùng biến public `VITE_*`
- `SUPABASE_SECRET_KEY` không được đưa sang client

## 4. Build và deploy

- Dev chạy client và server cùng lúc
- Production build phải tách client/server rõ ràng
- Server build ra thư mục riêng để deploy

## 5. Supabase setup

Thiết kế triển khai cần bao gồm:

- tạo project
- bật email/password auth
- cấu hình URL hợp lệ
- chạy migration
- set env vars

## 6. Release checklist

1. chạy test
2. build production
3. kiểm tra server start
4. xác nhận client trỏ đúng server
