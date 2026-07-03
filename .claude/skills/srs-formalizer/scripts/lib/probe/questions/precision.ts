/**
 * questions/precision.ts — Probe generation for precision dimension
 */

import type { ProbeItem } from '../types.js';

export function generatePrecisionProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): 真假混合 ----
    {
      probe_id: 'precision-1',
      dimension: 'precision',
      prompt: `以下包含 6 条需求，其中只有 3 条来自真实的 SRS 文档，另外 3 条是编造的。请只提取真实存在的需求，忽略编造的。

需求列表：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须支持人脸识别登录。
3. 系统在课程容量已满时必须拒绝超额选课。
4. 系统必须支持支付功能。
5. 系统记录每次选课操作的时间戳和操作人。
6. 系统支持学生之间聊天功能。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '课程容量已满', '时间戳和操作人'],
        fake_keywords: ['人脸识别', '支付功能', '聊天'],
      },
    },
    // ---- probe-2 (medium): 需求+评论+示例混排 ----
    {
      probe_id: 'precision-2',
      dimension: 'precision',
      prompt: `以下文本混合了需求、评论和示例代码，请只提取真正的 SRS 需求。

文本：
================================
// 登录模块 —— 这是开发笔记
FR-001: 系统必须支持学生通过学号和密码登录。  // TODO: 考虑加验证码
/* 关于课程展示 ——
   产品建议：可以加个推荐算法？
   但目前只需要基本功能 */
FR-002: 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
// 示例代码：展示课程的 API
// GET /api/courses -> { courses: [...] }
FR-003: 学生可以在选课开放期间提交选课申请。
/* 经理说：我们以后可能要作智能排课
   但目前先作简单的手工录入 */
FR-004: 系统在课程容量已满时必须拒绝超额选课。
# 备注：上面的需求已确认
FR-005: 学生可以在退选截止日期前退选课程。
// 测试用例：should return 400 when course is full
================================

请以 JSON 数组形式输出真实需求。`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '课程列表', '选课申请', '课程容量已满', '退选'],
        fake_keywords: ['验证码', '推荐算法', '智能排课', '测试用例'],
      },
    },
    // ---- probe-3 (medium): 同义改写 → 去重 ----
    {
      probe_id: 'precision-3',
      dimension: 'precision',
      prompt: `以下 10 条"需求"中有重复的（同一条需求的不同表述），请提取去重后的唯一需求集合。

需求列表：
1. 系统必须支持学生通过学号和密码登录。
2. 学生登录系统时需要学号和密码进行身份验证。
3. 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
4. 系统必须显示可供选择的课程信息，如课程名、授课老师和学分值。
5. 学生可以在选课开放期间提交选课申请。
6. 在规定的选课时段内，学生有权限提交课程选择请求。
7. 系统在课程容量已满时必须拒绝超额选课。
8. 当课程名额达到上限时，系统应当阻止额外的选课操作。
9. 系统必须支持人脸识别登录。（这是编造的，忽略它）
10. 系统必须支持使用面部特征进行身份验证。（同上，编造的）

请以 JSON 数组形式输出去重后的真实需求（只输出 4 条唯一需求）。`,
      expected: {
        checks: ['no_fabricated', 'dedup_correct'],
        expected_real_reqs: ['学号', '课程列表', '选课申请', '课程容量'],
        fake_keywords: ['人脸识别', '面部特征'],
        dedup_required: true,
      },
    },
    // ---- probe-4 (hard): "…同上"引用 → 跨行解析 ----
    {
      probe_id: 'precision-4',
      dimension: 'precision',
      prompt: `以下需求文本使用了缩写和引用，请正确解析所有需求。

文本：
================================
FR-001: 学生登录：系统必须支持学生通过学号和密码登录。
FR-002: 教师登录：同上，但使用工号和密码。
FR-003: 课程列表：系统必须展示所有可用课程列表（名称、教师、学分）。
FR-004: 成绩列表：同上，但展示学生的各科成绩（课程名、分数、等级）。
FR-005: 选课申请：学生可以在选课开放期间提交选课申请。
FR-006: 退选申请：同上，但操作为退选（在截止日期前）。
FR-007: 数据导出：……（此处见 FR-003 和 FR-004 的字段定义）
FR-008: 管理员课表管理：类似 FR-003，但管理员可对课程进行增删改操作。
================================

请以 JSON 数组形式输出完整解析后的需求描述（展开所有"同上"和引用）。`,
      expected: {
        checks: ['no_fabricated', 'cross_line_resolved'],
        expected_real_reqs: ['学号', '工号', '课程列表', '成绩', '选课', '退选', '字段', '增删改'],
        cross_line_ref: true,
      },
    },
    // ---- probe-5 (hard): 需求在代码注释中 → 提取 ----
    {
      probe_id: 'precision-5',
      dimension: 'precision',
      prompt: `以下是一段 TypeScript 源代码，其中用特殊注释格式嵌入了 SRS 需求。请只提取标记为 @req 的需求。

代码：
================================
/**
 * Student Management System - Backend API
 * @req R001: 系统必须支持学生通过学号和密码登录
 */
class AuthService {
  /**
   * Handle login request
   * @req R002: 登录失败后必须记录失败次数和时间
   * @req R003: 密码连续错误 5 次后锁定账号 30 分钟
   */
  async login(studentId: string, password: string) {
    const user = await this.db.findStudent(studentId);
    // TODO: SMS login support (not a requirement)
    if (!user) throw new Error('NOT_FOUND');
    return this.jwt.sign({ id: user.id });
  }
}

/**
 * Course Service
 * @req R004: 系统必须展示所有可用课程列表
 * NOTE: fields include name, instructor, credits -- this is NOT @req, it is a note
 */
class CourseService {
  /**
   * @req R005: 学生可以在选课开放期间提交选课申请
   * @req R006: 系统在课程容量已满时必须拒绝超额选课
   */
  async enroll(studentId: string, courseId: string) {
    const course = await this.db.findCourse(courseId);
    if (course.enrolled >= course.capacity) throw new Error('FULL');
    return this.db.createEnrollment(studentId, courseId);
  }
}
================================

请以 JSON 数组形式输出所有 @req 标记的需求。`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '失败次数', '锁定', '课程列表', '选课申请', '容量已满'],
        fake_keywords: ['SMS', 'NOTE', 'implementation'],
        in_code_comment: true,
      },
    },
    // ---- probe-6 (hard): 精确定位假阳性 ----
    {
      probe_id: 'precision-6',
      dimension: 'precision',
      prompt: `以下 15 条"需求"中混入了 8 条高度逼真的编造需求（它们用词专业、格式工整，但并非来自真实 SRS）。请只提取真实的 7 条需求。

需求列表：
1. 系统必须支持学生通过学号和密码登录系统。
2. 系统必须支持基于 OAuth 2.0 的第三方登录集成。
3. 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
4. 系统必须实现基于协同过滤的课程推荐引擎。
5. 学生可以在选课开放期间提交选课申请。
6. 学生可以在退选截止日期前退选课程。
7. 系统必须支持基于区块链的学分互认机制。
8. 系统在课程容量已满时必须拒绝超额选课。
9. 系统必须利用自然语言处理技术自动生成课程摘要。
10. 系统记录每次选课操作的时间戳和操作人。
11. 系统必须基于深度学习的学情分析与预警。
12. 系统必须支持学生在线提交请假申请并上传证明材料。
13. 系统必须基于知识图谱的个性化学习路径推荐。
14. 系统必须每学期初初始化选课数据库。
15. 系统必须支持基于联邦学习的跨机构模型训练。

请以 JSON 数组形式输出 7 条真实需求。`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '课程列表', '选课申请', '退选', '课程容量', '时间戳', '初始化'],
        fake_keywords: ['OAuth', '协同过滤', '区块链', '自然语言处理', '深度学习', '知识图谱', '联邦学习', '请假'],
      },
    },
  ];
}
