const assert=require('node:assert/strict');
const guard="    if (array_key_exists('grade_write_protocol', $input)\n        && in_array($key, ['grades', 'weekly_tests', 'scientific_grades'], true)) {\n        error_response('نسخة الخادم لا تدعم طريقة حفظ الدرجات المطلوبة؛ لم تتغير السجلات. حدّث الصفحة قبل إعادة المحاولة.', 503);\n    }\n\n";
function withoutGradeProtocolFloor(code){if(!code.includes(guard))return code;assert.equal(code.split(guard).length,2);return code.replace(guard,'');}
module.exports={withoutGradeProtocolFloor,guard};
