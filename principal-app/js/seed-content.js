/* ============================================================
   seed-content.js — the demo dataset, as plain data.
   No Firebase imports here on purpose: both the in-browser
   seeder (js/seed.js) and the Node script (scripts/seed.mjs)
   import this same file.
   ============================================================ */

export const SEED_USERS = [
  { key: 'student', name: 'Bryan', email: 'bryan@example.com', role: 'student', teacherSlot: null },
  { key: 'admin', name: 'Principal', email: 'principal@example.com', role: 'admin', teacherSlot: null },
  { key: 't1', name: 'Ms. Alvarez', email: 'teacher1@example.com', role: 'teacher', teacherSlot: 1 },
  { key: 't2', name: 'Mr. Okafor', email: 'teacher2@example.com', role: 'teacher', teacherSlot: 2 },
  { key: 't4', name: 'Ms. Duarte', email: 'teacher4@example.com', role: 'teacher', teacherSlot: 4 },
  { key: 't5', name: 'Mr. Tanaka', email: 'teacher5@example.com', role: 'teacher', teacherSlot: 5 },
];

export const A_DAYS = ['Monday', 'Wednesday', 'Friday'];
export const B_DAYS = ['Sunday', 'Tuesday', 'Thursday'];

/** Day offsets from "today" for the six sessions of a course. */
export const SESSION_OFFSETS = {
  'A-day': [-12, -10, -7, 0, 2, 4],
  'B-day': [-11, -9, -6, 1, 3, 5],
};

export const SEED_COURSES = [
  /* ------------------------------------------------ slot 1 · Algebra II */
  {
    key: 'algebra',
    teacherKey: 't1',
    title: 'Algebra II Foundations',
    slot: 1,
    dayType: 'A-day',
    sessionLengthMin: 50,
    studentName: 'Bryan',
    skillLevel: 'Intermediate',
    goal: 'Solve multi-step equations and systems independently, showing every step, by week 6.',
    lessons: [
      {
        topic: 'Solving multi-step linear equations',
        objective: 'Isolate the variable in equations with terms on both sides.',
        activities: 'Warm-up drill on inverse operations; guided practice on 4 equations; independent set of 6.',
        homework: 'Workbook p.34 #1–10, showing each step on its own line.',
        materials: [
          { type: 'video', title: 'Multi-step equations walkthrough', url: 'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:solve-equations-inequalities', durationMin: 12 },
          { type: 'reading', title: 'Inverse operations reference sheet', url: 'https://openstax.org/details/books/elementary-algebra-2e' },
          {
            type: 'slides',
            title: 'Solving Multi-Step Equations',
            slides: [
              {
                title: 'What is a multi-step equation?',
                bullets: [
                  'An equation that takes more than one operation to solve',
                  'Example: 3x + 7 = 22',
                  'Goal: get x completely alone on one side',
                ],
                notes: 'Ask Bryan to point out which parts of 3x + 7 = 22 are "attached" to x.',
              },
              {
                title: 'Step 1 — Undo addition or subtraction first',
                bullets: [
                  'Move constant terms away from the variable term',
                  '3x + 7 = 22  →  subtract 7 from both sides',
                  '3x = 15',
                ],
              },
              {
                title: 'Step 2 — Undo multiplication or division last',
                bullets: [
                  '3x = 15  →  divide both sides by 3',
                  'x = 5',
                  'Always check: 3(5) + 7 = 22 ✓',
                ],
              },
              {
                title: 'Your turn',
                bullets: [
                  'Solve 4x − 5 = 11 the same way',
                  'Undo subtraction first, then division',
                  'Write out both steps before checking your answer',
                ],
                notes: 'Have Bryan solve this on paper before revealing the next slide (there isn’t one — this is the last one).',
              },
            ],
          },
        ],
      },
      {
        topic: 'Inequalities and interval notation',
        objective: 'Solve linear inequalities and express solutions in interval notation.',
        activities: 'Number-line sketching; flip-the-sign investigation with negative coefficients; 8 practice problems.',
        homework: 'Write 5 inequalities from word descriptions and solve them.',
        materials: [
          { type: 'video', title: 'Why the inequality flips', url: 'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:solve-equations-inequalities', durationMin: 9 },
        ],
      },
      {
        topic: 'Absolute value equations',
        objective: 'Solve |ax + b| = c by splitting into two cases.',
        activities: 'Distance-on-a-number-line demo; two-case template; 6 problems including one no-solution case.',
        homework: 'Workbook p.41 #1–8.',
        materials: [
          { type: 'reading', title: 'Absolute value as distance', url: 'https://en.wikipedia.org/wiki/Absolute_value' },
        ],
      },
      {
        topic: 'Systems of equations: substitution',
        objective: 'Solve a 2×2 system by substituting one equation into the other.',
        activities: 'Recap of single-variable solving; substitution in 3 worked systems; independent practice.',
        homework: 'Solve 4 systems by substitution and check both equations.',
        materials: [
          { type: 'video', title: 'Substitution method, start to finish', url: 'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:systems-of-equations', durationMin: 14 },
          { type: 'reading', title: 'Systems of linear equations', url: 'https://en.wikipedia.org/wiki/System_of_linear_equations' },
        ],
      },
      {
        topic: 'Systems of equations: elimination',
        objective: 'Choose multipliers that eliminate a variable, then solve.',
        activities: 'Compare substitution vs elimination on the same system; 5 elimination problems.',
        homework: 'Workbook p.58 #2–12 even.',
        materials: [
          { type: 'video', title: 'Elimination with multipliers', url: 'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:systems-of-equations', durationMin: 11 },
        ],
      },
      {
        topic: 'Word problems with systems',
        objective: 'Translate a two-unknown story into a system and solve it.',
        activities: 'Define-your-variables routine; ticket-price and mixture problems; explain answers in a sentence.',
        homework: 'Write your own two-unknown word problem and solve it.',
        materials: [
          { type: 'reading', title: 'Setting up word problems', url: 'https://openstax.org/details/books/intermediate-algebra-2e' },
        ],
      },
    ],
    milestones: [
      { description: 'Solve any two-step equation without hints', targetWeek: 1, status: 'achieved', notes: 'Hit this in the first week — very solid.' },
      { description: 'Graph and interpret inequalities on a number line', targetWeek: 2, status: 'in_progress', notes: 'Sign flip still needs a reminder.' },
      { description: 'Set up a system from a word problem', targetWeek: 3, status: 'not_started', notes: '' },
      { description: 'Solve 2×2 systems by either method, unprompted', targetWeek: 4, status: 'not_started', notes: '' },
    ],
    quizzes: [
      {
        week: 1,
        title: 'Week 1 check-in — equations & inequalities',
        description: 'Five questions on everything from week one. Take your time and show your reasoning mentally before answering.',
        timeLimitMinutes: 10,
        questions: [
          {
            questionText: 'What is the first step in solving 3x + 7 = 22?',
            options: [
              { label: 'A', text: 'Subtract 7 from both sides' },
              { label: 'B', text: 'Divide both sides by 3' },
              { label: 'C', text: 'Add 7 to both sides' },
              { label: 'D', text: 'Multiply both sides by 3' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Solve: 5x − 4 = 3x + 10',
            options: [
              { label: 'A', text: 'x = 3' },
              { label: 'B', text: 'x = 7' },
              { label: 'C', text: 'x = 6' },
              { label: 'D', text: 'x = −7' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'When you divide both sides of an inequality by −2, what happens?',
            options: [
              { label: 'A', text: 'Nothing changes' },
              { label: 'B', text: 'The inequality sign flips direction' },
              { label: 'C', text: 'The solution becomes negative' },
              { label: 'D', text: 'The inequality has no solution' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'Which interval matches x > 4?',
            options: [
              { label: 'A', text: '[4, ∞)' },
              { label: 'B', text: '(−∞, 4)' },
              { label: 'C', text: '(4, ∞)' },
              { label: 'D', text: '(−∞, 4]' },
            ],
            correctIndex: 2,
          },
          {
            questionText: 'How many solutions does |x − 3| = 5 have?',
            options: [
              { label: 'A', text: 'None' },
              { label: 'B', text: 'One' },
              { label: 'C', text: 'Two' },
              { label: 'D', text: 'Infinitely many' },
            ],
            correctIndex: 2,
          },
        ],
      },
      {
        week: 2,
        title: 'Week 2 check-in — systems of equations',
        description: 'Four questions on substitution and elimination.',
        timeLimitMinutes: 8,
        questions: [
          {
            questionText: 'In the system y = 2x + 1 and 3x + y = 11, which method is fastest?',
            options: [
              { label: 'A', text: 'Substitution, because y is already isolated' },
              { label: 'B', text: 'Elimination, because the coefficients match' },
              { label: 'C', text: 'Graphing, because both are lines' },
              { label: 'D', text: 'Guess and check' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Solve the system: x + y = 10, x − y = 2',
            options: [
              { label: 'A', text: 'x = 4, y = 6' },
              { label: 'B', text: 'x = 6, y = 4' },
              { label: 'C', text: 'x = 5, y = 5' },
              { label: 'D', text: 'x = 8, y = 2' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'A system whose two lines are parallel and distinct has…',
            options: [
              { label: 'A', text: 'Exactly one solution' },
              { label: 'B', text: 'No solution' },
              { label: 'C', text: 'Infinitely many solutions' },
              { label: 'D', text: 'Two solutions' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'To eliminate x from 2x + 3y = 12 and 4x − y = 10, multiply the first equation by…',
            options: [
              { label: 'A', text: '2, then subtract' },
              { label: 'B', text: '−2, then add' },
              { label: 'C', text: '4, then add' },
              { label: 'D', text: '3, then subtract' },
            ],
            correctIndex: 1,
          },
        ],
      },
    ],
    gapReports: [
      {
        sessionIndex: 0,
        warmupResults: [
          { question: 'What is 7 × 8?', result: 'correct' },
          { question: 'Solve 2x = 14', result: 'correct' },
          { question: 'Solve x + 9 = 4', result: 'hesitant' },
        ],
        applicationTask: 'Solve 4x − 5 = 2x + 11 and explain each step aloud.',
        applicationResult: 'partially_correct',
        applicationNotes: 'Set the equation up confidently and collected like terms, then lost the sign moving −5 across.',
        identifiedGaps: [
          { description: 'Sign errors when moving a negative term across the equals sign', severity: 'major' },
        ],
        remediationPlan: 'Five sign-change drills at the start of next session, then re-test the same equation cold.',
      },
      {
        sessionIndex: 1,
        warmupResults: [
          { question: 'Solve x + 9 = 4', result: 'correct' },
          { question: 'Is −3 a solution to x < −1?', result: 'correct' },
          { question: 'Solve −2x > 8', result: 'incorrect' },
        ],
        applicationTask: 'Solve −3x + 2 ≤ 17 and graph the solution on a number line.',
        applicationResult: 'partially_correct',
        applicationNotes: 'Arithmetic was clean; forgot to flip the inequality after dividing by −3, so the graph pointed the wrong way.',
        identifiedGaps: [
          { description: 'Does not flip the inequality sign when dividing by a negative', severity: 'critical' },
          { description: 'Open vs closed circles on the number line', severity: 'minor' },
        ],
        remediationPlan: 'Flip-the-sign rule written at the top of the page every problem for a week; three graphing warm-ups per session.',
      },
    ],
  },

  /* --------------------------------------------------- slot 2 · Physics */
  {
    key: 'physics',
    teacherKey: 't2',
    title: 'Physics: Mechanics',
    slot: 2,
    dayType: 'B-day',
    sessionLengthMin: 45,
    studentName: 'Bryan',
    skillLevel: 'Beginner',
    goal: 'Read motion graphs fluently and apply F = ma to two-body problems by week 6.',
    lessons: [
      {
        topic: 'Motion in one dimension',
        objective: 'Distinguish distance from displacement and compute average speed.',
        activities: 'Hallway walking measurements; distance vs displacement table; 4 calculations.',
        homework: 'Record a 10-minute walk and compute both distance and displacement.',
        materials: [
          { type: 'video', title: 'Distance vs displacement', url: 'https://www.khanacademy.org/science/physics/one-dimensional-motion', durationMin: 8 },
          { type: 'reading', title: 'Kinematics overview', url: 'https://en.wikipedia.org/wiki/Kinematics' },
        ],
      },
      {
        topic: 'Velocity and acceleration graphs',
        objective: 'Read slope and area from position-time and velocity-time graphs.',
        activities: 'Match 6 graphs to 6 stories; compute slope on two segments; sketch the matching v-t graph.',
        homework: 'Sketch v-t graphs for three described journeys.',
        materials: [
          { type: 'video', title: 'Reading velocity-time graphs', url: 'https://www.khanacademy.org/science/physics/one-dimensional-motion', durationMin: 10 },
        ],
      },
      {
        topic: 'Free fall and g',
        objective: 'Apply v = gt and d = ½gt² to falling objects.',
        activities: 'Drop timing experiment; two worked problems; discuss air resistance as the missing term.',
        homework: 'Compute fall time from a 20 m height, then check against the experiment.',
        materials: [
          { type: 'reading', title: 'Free fall', url: 'https://en.wikipedia.org/wiki/Free_fall' },
        ],
      },
      {
        topic: 'Newton’s first and second laws',
        objective: 'State both laws and use F = ma in one dimension.',
        activities: 'Cart and pulley demo; unit analysis of newtons; 5 F = ma problems.',
        homework: 'Five F = ma problems with units shown at every step.',
        materials: [
          { type: 'video', title: 'Newton’s laws in 10 minutes', url: 'https://www.khanacademy.org/science/physics/forces-newtons-laws', durationMin: 10 },
        ],
      },
      {
        topic: 'Friction',
        objective: 'Compute static and kinetic friction from the normal force.',
        activities: 'Sliding block measurements; derive μ from data; 4 problems.',
        homework: 'Textbook ch.5 problems 3, 7, 11.',
        materials: [
          { type: 'reading', title: 'Friction', url: 'https://en.wikipedia.org/wiki/Friction' },
        ],
      },
      {
        topic: 'Free-body diagram practice',
        objective: 'Draw complete, correctly labelled free-body diagrams.',
        activities: 'Six scenarios drawn and critiqued; find the missing force in each; peer-check routine.',
        homework: 'Draw free-body diagrams for four everyday situations.',
        materials: [
          { type: 'video', title: 'Free-body diagrams step by step', url: 'https://www.khanacademy.org/science/physics/forces-newtons-laws', durationMin: 13 },
        ],
      },
    ],
    milestones: [
      { description: 'Read a velocity-time graph accurately', targetWeek: 1, status: 'achieved', notes: 'Strong graph intuition.' },
      { description: 'Draw complete free-body diagrams every time', targetWeek: 2, status: 'behind', notes: 'Normal force still gets left off.' },
      { description: 'Apply F = ma to two-body problems', targetWeek: 4, status: 'not_started', notes: '' },
    ],
    quizzes: [
      {
        week: 1,
        title: 'Week 1 check-in — motion',
        description: 'Four questions on kinematics and graph reading.',
        timeLimitMinutes: 8,
        questions: [
          {
            questionText: 'A runner completes one lap of a 400 m track. What is their displacement?',
            options: [
              { label: 'A', text: '400 m' },
              { label: 'B', text: '0 m' },
              { label: 'C', text: '200 m' },
              { label: 'D', text: 'It depends on their speed' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'On a position-time graph, what does the slope represent?',
            options: [
              { label: 'A', text: 'Acceleration' },
              { label: 'B', text: 'Velocity' },
              { label: 'C', text: 'Distance travelled' },
              { label: 'D', text: 'Force' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'A velocity-time graph is a horizontal line above zero. The object is…',
            options: [
              { label: 'A', text: 'Speeding up' },
              { label: 'B', text: 'At rest' },
              { label: 'C', text: 'Moving at constant velocity' },
              { label: 'D', text: 'Slowing down' },
            ],
            correctIndex: 2,
          },
          {
            questionText: 'Ignoring air resistance, how fast is a dropped ball moving after 2 seconds?',
            options: [
              { label: 'A', text: 'About 5 m/s' },
              { label: 'B', text: 'About 10 m/s' },
              { label: 'C', text: 'About 20 m/s' },
              { label: 'D', text: 'About 40 m/s' },
            ],
            correctIndex: 2,
          },
        ],
      },
      {
        week: 2,
        title: 'Week 2 check-in — forces',
        description: 'Three questions on Newton’s laws and friction.',
        timeLimitMinutes: 6,
        questions: [
          {
            questionText: 'A 2 kg object accelerates at 3 m/s². What net force acts on it?',
            options: [
              { label: 'A', text: '1.5 N' },
              { label: 'B', text: '5 N' },
              { label: 'C', text: '6 N' },
              { label: 'D', text: '9 N' },
            ],
            correctIndex: 2,
          },
          {
            questionText: 'A book rests on a table. Which force pair is shown in its free-body diagram?',
            options: [
              { label: 'A', text: 'Weight down, normal force up' },
              { label: 'B', text: 'Weight down only' },
              { label: 'C', text: 'Friction up, weight down' },
              { label: 'D', text: 'Applied force and tension' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Kinetic friction depends on…',
            options: [
              { label: 'A', text: 'The contact area' },
              { label: 'B', text: 'The normal force and the surfaces involved' },
              { label: 'C', text: 'The object’s velocity' },
              { label: 'D', text: 'The object’s volume' },
            ],
            correctIndex: 1,
          },
        ],
      },
    ],
    gapReports: [
      {
        sessionIndex: 1,
        warmupResults: [
          { question: 'Units of acceleration?', result: 'correct' },
          { question: 'Slope of a position-time graph?', result: 'correct' },
          { question: 'Area under a velocity-time graph?', result: 'hesitant' },
        ],
        applicationTask: 'Given a three-segment velocity-time graph, describe the motion and find total displacement.',
        applicationResult: 'correct',
        applicationNotes: 'Described all three segments correctly and computed the area without prompting.',
        identifiedGaps: [
          { description: 'Area-under-curve interpretation needs one prompt before it clicks', severity: 'minor' },
        ],
        remediationPlan: 'One area-under-graph warm-up per session for two weeks.',
      },
      {
        sessionIndex: 2,
        warmupResults: [
          { question: 'State Newton’s second law', result: 'correct' },
          { question: 'Forces on a resting book?', result: 'incorrect' },
          { question: 'Value of g?', result: 'correct' },
        ],
        applicationTask: 'Draw the free-body diagram for a box being pushed across a rough floor.',
        applicationResult: 'needs_work',
        applicationNotes: 'Drew applied force and weight, omitted the normal force and friction entirely.',
        identifiedGaps: [
          { description: 'Omits the normal force in free-body diagrams', severity: 'critical' },
          { description: 'Friction direction guessed rather than reasoned', severity: 'major' },
        ],
        remediationPlan: 'Four-force checklist (weight, normal, applied, friction) taped to the notebook; one diagram per session graded against it.',
      },
    ],
  },

  /* --------------------------------------------------- slot 4 · Spanish */
  {
    key: 'spanish',
    teacherKey: 't4',
    title: 'Spanish Conversation',
    slot: 4,
    dayType: 'A-day',
    sessionLengthMin: 40,
    studentName: 'Bryan',
    skillLevel: 'Beginner',
    goal: 'Hold a five-minute unscripted conversation about everyday topics by week 8.',
    lessons: [
      {
        topic: 'Present tense of regular verbs',
        objective: 'Conjugate -ar, -er and -ir verbs in the present tense.',
        activities: 'Conjugation ladder; 10-verb speaking drill; describe three daily actions aloud.',
        homework: 'Record yourself conjugating five verbs from memory.',
        materials: [
          { type: 'reading', title: 'Spanish present tense conjugation', url: 'https://en.wikipedia.org/wiki/Spanish_conjugation' },
          { type: 'video', title: 'Regular verb endings drill', url: 'https://www.spanishdict.com/guide/spanish-present-tense-forms', durationMin: 7 },
        ],
      },
      {
        topic: 'Asking questions',
        objective: 'Form yes/no and question-word questions naturally.',
        activities: 'Question-word bingo; interview the teacher for 3 minutes; correct 5 malformed questions.',
        homework: 'Write ten questions you would ask a new classmate.',
        materials: [
          { type: 'reading', title: 'Question words in Spanish', url: 'https://www.spanishdict.com/guide/spanish-question-words' },
        ],
      },
      {
        topic: 'Describing your day',
        objective: 'Narrate a daily routine using time expressions.',
        activities: 'Timeline vocabulary; two-minute unscripted description; peer follow-up questions.',
        homework: 'Write eight sentences about yesterday’s routine in the present tense.',
        materials: [
          { type: 'video', title: 'Daily routine vocabulary', url: 'https://www.spanishdict.com/guide/spanish-reflexive-verbs', durationMin: 9 },
        ],
      },
      {
        topic: 'Introduction to the preterite',
        objective: 'Form the preterite of regular verbs and recognise when to use it.',
        activities: 'Present vs past sorting task; conjugation practice; retell this morning in the past tense.',
        homework: 'Convert ten present-tense sentences to the preterite.',
        materials: [
          { type: 'reading', title: 'Preterite tense', url: 'https://www.spanishdict.com/guide/spanish-preterite-tense' },
        ],
      },
      {
        topic: 'Irregular preterite verbs',
        objective: 'Use ser, ir, tener, hacer and estar correctly in the past.',
        activities: 'Irregular flashcard sprint; story-building with three irregulars; error-correction round.',
        homework: 'Ten sentences, each using a different irregular preterite verb.',
        materials: [
          { type: 'video', title: 'Irregular preterite patterns', url: 'https://www.spanishdict.com/guide/spanish-irregular-preterite-verbs', durationMin: 11 },
        ],
      },
      {
        topic: 'Telling a story about the weekend',
        objective: 'Narrate a past event for two minutes without notes.',
        activities: 'Story-spine planning; two-minute telling; teacher asks three follow-ups in Spanish.',
        homework: 'Prepare a three-minute story about a trip you have taken.',
        materials: [
          { type: 'reading', title: 'Connectors for storytelling', url: 'https://www.spanishdict.com/guide/spanish-conjunctions' },
        ],
      },
    ],
    milestones: [
      { description: 'Introduce yourself unscripted for 60 seconds', targetWeek: 1, status: 'achieved', notes: 'Did this on day two.' },
      { description: 'Hold a two-minute present-tense conversation', targetWeek: 2, status: 'in_progress', notes: 'Fluent but leans on the same six verbs.' },
      { description: 'Use ten irregular preterite verbs correctly', targetWeek: 4, status: 'not_started', notes: '' },
    ],
    quizzes: [
      {
        week: 1,
        title: 'Week 1 check-in — present tense',
        description: 'Four questions on regular verbs and question forms.',
        timeLimitMinutes: 6,
        questions: [
          {
            questionText: 'Which is the correct yo form of "hablar"?',
            options: [
              { label: 'A', text: 'hablo' },
              { label: 'B', text: 'hablas' },
              { label: 'C', text: 'hablamos' },
              { label: 'D', text: 'hablan' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Complete: Nosotros ____ (comer) a las dos.',
            options: [
              { label: 'A', text: 'como' },
              { label: 'B', text: 'comemos' },
              { label: 'C', text: 'comen' },
              { label: 'D', text: 'comes' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'Which question word asks "where"?',
            options: [
              { label: 'A', text: 'Cuándo' },
              { label: 'B', text: 'Cómo' },
              { label: 'C', text: 'Dónde' },
              { label: 'D', text: 'Por qué' },
            ],
            correctIndex: 2,
          },
          {
            questionText: 'Which sentence is a correctly formed question?',
            options: [
              { label: 'A', text: '¿Tú vives dónde?' },
              { label: 'B', text: '¿Dónde vives tú?' },
              { label: 'C', text: '¿Dónde tú vivir?' },
              { label: 'D', text: '¿Vives dónde tú?' },
            ],
            correctIndex: 1,
          },
        ],
      },
      {
        week: 2,
        title: 'Week 2 check-in — preterite',
        description: 'Three questions on the past tense.',
        timeLimitMinutes: 6,
        questions: [
          {
            questionText: 'What is the yo preterite form of "comer"?',
            options: [
              { label: 'A', text: 'comí' },
              { label: 'B', text: 'comía' },
              { label: 'C', text: 'como' },
              { label: 'D', text: 'comeré' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Which verb is irregular in the preterite?',
            options: [
              { label: 'A', text: 'hablar' },
              { label: 'B', text: 'vivir' },
              { label: 'C', text: 'ir' },
              { label: 'D', text: 'comer' },
            ],
            correctIndex: 2,
          },
          {
            questionText: 'The preterite is used for…',
            options: [
              { label: 'A', text: 'Habitual past actions' },
              { label: 'B', text: 'Completed past actions' },
              { label: 'C', text: 'Future plans' },
              { label: 'D', text: 'Ongoing present actions' },
            ],
            correctIndex: 1,
          },
        ],
      },
    ],
    gapReports: [
      {
        sessionIndex: 0,
        warmupResults: [
          { question: 'Conjugate hablar (yo)', result: 'correct' },
          { question: 'Conjugate vivir (nosotros)', result: 'hesitant' },
          { question: 'Conjugate comer (ellos)', result: 'correct' },
        ],
        applicationTask: 'Describe your morning in five sentences, unscripted.',
        applicationResult: 'correct',
        applicationNotes: 'Six sentences, no English fillers. Pronunciation of "vivimos" wobbled once.',
        identifiedGaps: [
          { description: 'Nosotros forms of -ir verbs come slowly', severity: 'minor' },
        ],
        remediationPlan: 'Two-minute nosotros conjugation sprint at the top of each session.',
      },
      {
        sessionIndex: 2,
        warmupResults: [
          { question: 'Question word for "when"?', result: 'correct' },
          { question: 'Ask me my age in Spanish', result: 'correct' },
          { question: 'Ask me where I live', result: 'correct' },
        ],
        applicationTask: 'Interview the teacher for two minutes using at least six different question words.',
        applicationResult: 'correct',
        applicationNotes: 'Used seven question words and followed up on answers — a real conversation.',
        identifiedGaps: [],
        remediationPlan: 'Move on to the preterite as planned; keep one question-forming warm-up for maintenance.',
      },
    ],
  },

  /* ------------------------------------------ slot 5 · Computer Science */
  {
    key: 'cs',
    teacherKey: 't5',
    title: 'Intro to Computer Science',
    slot: 5,
    dayType: 'B-day',
    sessionLengthMin: 60,
    studentName: 'Bryan',
    skillLevel: 'Beginner',
    goal: 'Write and debug a 40-line Python program with functions and loops by week 8.',
    lessons: [
      {
        topic: 'Variables and types',
        objective: 'Store values in variables and predict their types.',
        activities: 'REPL exploration; type() guessing game; write 5 assignments and print them.',
        homework: 'Write a program that stores your name, age and favourite number, then prints a sentence.',
        materials: [
          { type: 'reading', title: 'Python variables tutorial', url: 'https://docs.python.org/3/tutorial/introduction.html' },
          { type: 'video', title: 'Variables and types', url: 'https://www.khanacademy.org/computing/intro-to-python-fundamentals', durationMin: 10 },
        ],
      },
      {
        topic: 'Conditionals',
        objective: 'Branch program flow with if / elif / else.',
        activities: 'Truth-table warm-up; write a grade classifier; trace three snippets by hand.',
        homework: 'Write a program that says whether a number is positive, negative or zero.',
        materials: [
          { type: 'reading', title: 'Control flow', url: 'https://docs.python.org/3/tutorial/controlflow.html' },
        ],
      },
      {
        topic: 'Loops',
        objective: 'Repeat work with for and while loops.',
        activities: 'Count-to-ten together; convert a for loop to a while loop; find the off-by-one bug.',
        homework: 'Print the first 20 even numbers using a loop.',
        materials: [
          { type: 'video', title: 'Loops explained', url: 'https://www.khanacademy.org/computing/intro-to-python-fundamentals', durationMin: 12 },
        ],
      },
      {
        topic: 'Functions',
        objective: 'Define functions with parameters and return values.',
        activities: 'Refactor duplicated code into a function; parameters vs arguments; write 3 functions.',
        homework: 'Write a function that returns the larger of two numbers, and test it four ways.',
        materials: [
          { type: 'reading', title: 'Defining functions', url: 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions' },
        ],
      },
      {
        topic: 'Lists and iteration',
        objective: 'Build lists and iterate over them to compute a result.',
        activities: 'List surgery (append, index, slice); sum a list by hand then with a loop; average function.',
        homework: 'Write a program that finds the largest value in a list without using max().',
        materials: [
          { type: 'reading', title: 'Data structures: lists', url: 'https://docs.python.org/3/tutorial/datastructures.html' },
        ],
      },
      {
        topic: 'Debugging strategies',
        objective: 'Locate a bug systematically instead of by guessing.',
        activities: 'Read the traceback out loud; print-statement bisection; fix three seeded bugs.',
        homework: 'Fix the three broken programs in the shared folder and note what the bug was.',
        materials: [
          { type: 'video', title: 'How to read a traceback', url: 'https://www.khanacademy.org/computing/intro-to-python-fundamentals', durationMin: 8 },
        ],
      },
    ],
    milestones: [
      { description: 'Explain the difference between = and ==', targetWeek: 1, status: 'achieved', notes: '' },
      { description: 'Write a loop that sums a list', targetWeek: 2, status: 'in_progress', notes: 'Gets there with one hint about the accumulator.' },
      { description: 'Write a function with parameters and a return value', targetWeek: 3, status: 'not_started', notes: '' },
      { description: 'Debug a 30-line program independently', targetWeek: 6, status: 'not_started', notes: '' },
    ],
    quizzes: [
      {
        week: 1,
        title: 'Week 1 check-in — variables, conditionals, loops',
        description: 'Five questions on the fundamentals.',
        timeLimitMinutes: 10,
        questions: [
          {
            questionText: 'What does x = 5 do in Python?',
            options: [
              { label: 'A', text: 'Tests whether x equals 5' },
              { label: 'B', text: 'Assigns 5 to x' },
              { label: 'C', text: 'Declares x as an integer type permanently' },
              { label: 'D', text: 'Prints 5' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'What is the type of 3.0 in Python?',
            options: [
              { label: 'A', text: 'int' },
              { label: 'B', text: 'float' },
              { label: 'C', text: 'str' },
              { label: 'D', text: 'bool' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'How many times does "for i in range(3)" run its body?',
            options: [
              { label: 'A', text: '2' },
              { label: 'B', text: '3' },
              { label: 'C', text: '4' },
              { label: 'D', text: 'Forever' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'Which operator compares two values for equality?',
            options: [
              { label: 'A', text: '=' },
              { label: 'B', text: '==' },
              { label: 'C', text: '=>' },
              { label: 'D', text: ':=' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'What happens if a while loop’s condition never becomes false?',
            options: [
              { label: 'A', text: 'The loop runs forever' },
              { label: 'B', text: 'Python stops it after 100 rounds' },
              { label: 'C', text: 'It raises a SyntaxError' },
              { label: 'D', text: 'It runs once' },
            ],
            correctIndex: 0,
          },
        ],
      },
      {
        week: 2,
        title: 'Week 2 check-in — functions and lists',
        description: 'Four questions on functions, lists and debugging.',
        timeLimitMinutes: 8,
        questions: [
          {
            questionText: 'What does a function without a return statement give back?',
            options: [
              { label: 'A', text: '0' },
              { label: 'B', text: 'None' },
              { label: 'C', text: 'An empty string' },
              { label: 'D', text: 'It raises an error' },
            ],
            correctIndex: 1,
          },
          {
            questionText: 'What is the index of the first element of a Python list?',
            options: [
              { label: 'A', text: '0' },
              { label: 'B', text: '1' },
              { label: 'C', text: '−1' },
              { label: 'D', text: 'It depends on the list' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'Which line correctly defines a function taking two parameters?',
            options: [
              { label: 'A', text: 'def add(a, b):' },
              { label: 'B', text: 'def add[a, b]:' },
              { label: 'C', text: 'function add(a, b) {' },
              { label: 'D', text: 'def add a, b:' },
            ],
            correctIndex: 0,
          },
          {
            questionText: 'A traceback’s last line tells you…',
            options: [
              { label: 'A', text: 'Which file to delete' },
              { label: 'B', text: 'The error type and message' },
              { label: 'C', text: 'How long the program ran' },
              { label: 'D', text: 'Nothing useful' },
            ],
            correctIndex: 1,
          },
        ],
      },
    ],
    gapReports: [
      {
        sessionIndex: 1,
        warmupResults: [
          { question: 'What does == mean?', result: 'correct' },
          { question: 'Type of "7"?', result: 'correct' },
          { question: 'What prints: x = 2; x = x + 3; print(x)', result: 'correct' },
        ],
        applicationTask: 'Write a program that classifies a number as positive, negative or zero.',
        applicationResult: 'correct',
        applicationNotes: 'Reached for elif unprompted and tested all three branches without being asked.',
        identifiedGaps: [],
        remediationPlan: 'Ready for loops next session; add one tracing warm-up to keep it sharp.',
      },
      {
        sessionIndex: 2,
        warmupResults: [
          { question: 'How many times does range(4) loop?', result: 'correct' },
          { question: 'What is an accumulator variable?', result: 'hesitant' },
          { question: 'Fix: for i in range(3) print(i)', result: 'incorrect' },
        ],
        applicationTask: 'Write a loop that sums the numbers in [4, 8, 15, 16].',
        applicationResult: 'partially_correct',
        applicationNotes: 'Structured the loop correctly but initialised the total inside the loop, so it reset each pass.',
        identifiedGaps: [
          { description: 'Initialises the accumulator inside the loop instead of before it', severity: 'major' },
          { description: 'Misses the colon at the end of a for statement', severity: 'minor' },
        ],
        remediationPlan: 'Hand-trace two accumulator loops per session for a week; colon check added to the pre-run checklist.',
      },
    ],
  },
];

/** The student's seeded attempt: quiz key + chosen answers (index per question). */
export const SEED_ATTEMPT = {
  courseKey: 'algebra',
  quizWeek: 1,
  selections: [0, 1, 0, 2, 2],  // 4/5 — misses the inequality flip, matching the gap reports
  timeSpentSeconds: 372,
};

export const SEED_ASSESSMENTS = [
  { courseKey: 'algebra', sessionIndex: 1, understandingRating: 3, confidenceRating: 2, notes: 'The flipping rule still catches me out when the number is negative.' },
  { courseKey: 'cs', sessionIndex: 2, understandingRating: 4, confidenceRating: 4, notes: 'Loops make sense now that I traced them on paper.' },
];

/* ------------------------------------------------------------ builders */

const pad = (n) => String(n).padStart(2, '0');

export function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftYMD(baseDate, days) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export const SLOT_TIMES = { 1: '09:00', 2: '10:30', 3: '11:30', 4: '13:00', 5: '14:30', 6: '16:00' };

/**
 * Expands a seed course into flat documents ready for Firestore.
 * `today` defaults to now so every seeded run looks current.
 */
export function buildCourse(seed, { today = new Date() } = {}) {
  const dayNames = seed.dayType === 'B-day' ? B_DAYS : A_DAYS;
  const offsets = SESSION_OFFSETS[seed.dayType] || SESSION_OFFSETS['A-day'];
  const time = SLOT_TIMES[seed.slot] || '09:00';

  const lessons = seed.lessons.map((lesson, i) => ({
    weekNumber: Math.floor(i / 3) + 1,
    sessionNumber: (i % 3) + 1,
    dayOfWeek: dayNames[i % 3],
    topic: lesson.topic,
    objective: lesson.objective,
    activities: lesson.activities,
    homework: lesson.homework,
    order: i + 1,
    materials: (lesson.materials || []).map((m, mi) => ({
      type: m.type,
      title: m.title,
      url: m.url || '',
      durationMin: m.type === 'video' ? (m.durationMin || 10) : 0,
      order: mi + 1,
      ...(m.type === 'slides' ? { slides: m.slides } : {}),
    })),
  }));

  const sessions = lessons.map((lesson, i) => {
    const offset = offsets[i] ?? i;
    /* one cancelled session in Spanish keeps the streak logic honest */
    const cancelled = seed.key === 'spanish' && i === 1;
    return {
      lessonIndex: i,
      scheduledDate: shiftYMD(today, offset),
      scheduledTime: time,
      status: cancelled ? 'cancelled' : offset < 0 ? 'completed' : 'upcoming',
      teacherNotes: offset < 0 && !cancelled ? `Covered ${lesson.topic.toLowerCase()}.` : '',
    };
  });

  return { lessons, sessions };
}
