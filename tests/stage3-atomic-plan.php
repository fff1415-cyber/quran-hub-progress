<?php
declare(strict_types=1);
require __DIR__.'/backend-grade-cell-operations.php';require __DIR__.'/atomic-plan-cases.php';
$pdo=gradeCellsSeed();atomicPlanCases($pdo);
