<?php

declare(strict_types=1);

require_once __DIR__ . '/login.php';
require_once __DIR__ . '/students.php';
require_once __DIR__ . '/halaqat.php';
require_once __DIR__ . '/role_accounts.php';
require_once __DIR__ . '/app_state.php';
require_once __DIR__ . '/semesters.php';
require_once __DIR__ . '/plans.php';
require_once __DIR__ . '/evaluation_settings.php';
require_once __DIR__ . '/health.php';
require_once __DIR__ . '/tenant_info.php';
require_once __DIR__ . '/tenant_resolve.php';
require_once __DIR__ . '/complex_branding.php';
require_once __DIR__ . '/kiosk.php';
require_once __DIR__ . '/platform_admin.php';

function route_request(string $method, string $path): void
{
    if ($path === '/health' && $method === 'GET') {
        handle_health_check();
        return;
    }
    if ($path === '/tenant-info' && $method === 'GET') {
        handle_tenant_info();
        return;
    }
    if (preg_match('#^/tenant-info/([a-z0-9-]+)$#i', $path) && $method === 'GET') {
        handle_tenant_info();
        return;
    }
    if ($path === '/tenant-resolve' && $method === 'GET') {
        handle_tenant_resolve();
        return;
    }
    if ($path === '/next-subdomain' && $method === 'GET') {
        handle_next_subdomain();
        return;
    }
    if ($path === '/complex-register' && $method === 'POST') {
        handle_complex_register();
        return;
    }
    if ($path === '/complex-branding' && $method === 'GET') {
        handle_get_complex_branding();
        return;
    }
    if ($path === '/complex-branding' && $method === 'PUT') {
        handle_put_complex_branding();
        return;
    }
    if ($path === '/complex-branding/logo' && $method === 'POST') {
        handle_post_complex_branding_logo();
        return;
    }
    if ($path === '/complex-branding/logo' && $method === 'DELETE') {
        handle_delete_complex_branding_logo();
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
    if ($path === '/semesters/active' && $method === 'PUT') {
        handle_update_active_semester();
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
    if ($path === '/plans/assignment-quotas' && $method === 'PATCH') {
        handle_patch_assignment_quotas();
        return;
    }
    if ($path === '/plans/apply-input' && $method === 'POST') {
        handle_apply_plan_input();
        return;
    }
    if ($path === '/plans/remove-completions' && $method === 'POST') {
        handle_remove_plan_completions();
        return;
    }
    if ($path === '/plans' && $method === 'DELETE') {
        handle_delete_plan();
        return;
    }
    if ($path === '/evaluation-settings' && $method === 'GET') {
        handle_get_evaluation_settings();
        return;
    }
    if ($path === '/evaluation-settings' && $method === 'PUT') {
        handle_put_evaluation_settings();
        return;
    }
    if ($path === '/kiosk/session' && $method === 'GET') {
        handle_kiosk_session();
        return;
    }
    if ($path === '/kiosk/check-in' && $method === 'POST') {
        handle_kiosk_check_in();
        return;
    }
    if ($path === '/kiosk/settings' && $method === 'GET') {
        handle_kiosk_get_settings();
        return;
    }
    if ($path === '/kiosk/settings' && $method === 'PUT') {
        handle_kiosk_put_settings();
        return;
    }
    if ($path === '/platform/login' && $method === 'POST') {
        handle_platform_login();
        return;
    }
    if ($path === '/platform/complexes' && $method === 'GET') {
        handle_platform_list_complexes();
        return;
    }
    if ($path === '/platform/complexes' && $method === 'PATCH') {
        handle_platform_patch_complex();
        return;
    }
    if ($path === '/platform/role-accounts' && $method === 'GET') {
        handle_platform_list_role_accounts();
        return;
    }
    if ($path === '/platform/role-accounts' && $method === 'DELETE') {
        handle_platform_delete_role_account();
        return;
    }
    if ($path === '/platform/revoke-access' && $method === 'POST') {
        handle_platform_revoke_access();
        return;
    }

    error_response('Not found', 404);
}
