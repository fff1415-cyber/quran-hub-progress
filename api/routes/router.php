<?php

declare(strict_types=1);

require_once __DIR__ . '/login.php';
require_once __DIR__ . '/students.php';
require_once __DIR__ . '/halaqat.php';
require_once __DIR__ . '/role_accounts.php';
require_once __DIR__ . '/app_state.php';
require_once __DIR__ . '/semesters.php';
require_once __DIR__ . '/plans.php';
require_once __DIR__ . '/health.php';

function route_request(string $method, string $path): void
{
    if ($path === '/health' && $method === 'GET') {
        handle_health_check();
        return;
    }
    if ($method === 'POST' && $path === '/login/code') {
        handle_login_by_code();
        return;
    }
    if ($method === 'POST' && $path === '/login/national-id') {
        handle_login_by_national_id();
        return;
    }
    if ($path === '/students/public' && $method === 'GET') {
        handle_list_students_public();
        return;
    }
    if ($path === '/students' && $method === 'GET') {
        handle_list_students();
        return;
    }
    if ($path === '/students' && $method === 'POST') {
        handle_upsert_students();
        return;
    }
    if ($path === '/students' && $method === 'PATCH') {
        handle_patch_student();
        return;
    }
    if ($path === '/students' && $method === 'DELETE') {
        handle_delete_student();
        return;
    }
    if ($path === '/halaqat/public' && $method === 'GET') {
        handle_list_halaqat_public();
        return;
    }
    if ($path === '/halaqat' && $method === 'GET') {
        handle_list_halaqat();
        return;
    }
    if ($path === '/halaqat' && $method === 'POST') {
        handle_upsert_halaqat();
        return;
    }
    if ($path === '/halaqat' && $method === 'DELETE') {
        handle_delete_halaqa();
        return;
    }
    if ($path === '/role-accounts' && $method === 'GET') {
        handle_list_role_accounts();
        return;
    }
    if ($path === '/role-accounts' && $method === 'POST') {
        handle_upsert_role_account();
        return;
    }
    if ($path === '/role-accounts' && $method === 'DELETE') {
        handle_delete_role_account();
        return;
    }
    if ($path === '/app-state' && $method === 'GET') {
        handle_list_app_state();
        return;
    }
    if ($path === '/app-state' && $method === 'POST') {
        handle_set_app_state();
        return;
    }
    if ($path === '/semesters' && $method === 'GET') {
        handle_list_semesters();
        return;
    }
    if ($path === '/semesters/active' && $method === 'GET') {
        handle_get_active_semester();
        return;
    }
    if ($path === '/semesters' && $method === 'POST') {
        handle_create_semester();
        return;
    }
    if ($path === '/plans' && $method === 'GET') {
        handle_list_plans();
        return;
    }
    if ($path === '/plans/detail' && $method === 'GET') {
        handle_plan_detail();
        return;
    }
    if ($path === '/plans/student-sheet' && $method === 'GET') {
        handle_student_plan_sheet();
        return;
    }
    if ($path === '/plans/import' && $method === 'POST') {
        handle_import_plans();
        return;
    }
    if ($path === '/plans/assign' && $method === 'POST') {
        handle_assign_plan();
        return;
    }
    if ($path === '/plans/assignment' && $method === 'PATCH') {
        handle_patch_assignment();
        return;
    }
    if ($path === '/plans/apply-input' && $method === 'POST') {
        handle_apply_plan_input();
        return;
    }

    error_response('Not found', 404);
}
