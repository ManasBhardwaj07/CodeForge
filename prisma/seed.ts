import { ProblemDifficulty } from "../generated/prisma";
import { disconnectPrisma, prisma } from "./client";

const PROBLEMS = [
  {
    slug: "two-sum-variant",
    title: "Two Sum Variant",
    description: "Given two integers separated by a space, print their sum.\n\nExample:\nInput: 1 2\nOutput: 3",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "1 2",     output: "3",   sample: true },
      { idx: 2, input: "10 -4",   output: "6",   sample: true },
      { idx: 3, input: "100 200", output: "300", sample: false },
    ],
  },
  {
    slug: "max-of-three",
    title: "Max Of Three",
    description: "Given three integers separated by spaces, print the largest.\n\nExample:\nInput: 1 2 3\nOutput: 3",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "1 2 3",   output: "3",  sample: true },
      { idx: 2, input: "9 7 8",   output: "9",  sample: true },
      { idx: 3, input: "-2 -9 -1",output: "-1", sample: false },
    ],
  },
  {
    slug: "fizzbuzz",
    title: "FizzBuzz",
    description: "Given a number N, print all numbers from 1 to N. For multiples of 3 print 'Fizz', multiples of 5 print 'Buzz', multiples of both print 'FizzBuzz'.\n\nExample:\nInput: 5\nOutput:\n1\n2\nFizz\n4\nBuzz",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "5",  output: "1\n2\nFizz\n4\nBuzz",                            sample: true },
      { idx: 2, input: "15", output: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz", sample: true },
      { idx: 3, input: "3",  output: "1\n2\nFizz",                                     sample: false },
    ],
  },
  {
    slug: "reverse-string",
    title: "Reverse String",
    description: "Given a string on a single line, print it reversed.\n\nExample:\nInput: hello\nOutput: olleh",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "hello",   output: "olleh",   sample: true },
      { idx: 2, input: "racecar", output: "racecar", sample: true },
      { idx: 3, input: "CodeForge", output: "egrFedoC", sample: false },
    ],
  },
  {
    slug: "palindrome-check",
    title: "Palindrome Check",
    description: "Given a string, print 'YES' if it is a palindrome (same forwards and backwards, ignoring case), otherwise print 'NO'.\n\nExample:\nInput: Racecar\nOutput: YES",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "Racecar", output: "YES", sample: true },
      { idx: 2, input: "hello",   output: "NO",  sample: true },
      { idx: 3, input: "A",       output: "YES", sample: false },
      { idx: 4, input: "abba",    output: "YES", sample: false },
    ],
  },
  {
    slug: "count-words",
    title: "Count Words",
    description: "Given a sentence, print the number of words (words are separated by single spaces).\n\nExample:\nInput: hello world foo\nOutput: 3",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "hello world foo",  output: "3", sample: true },
      { idx: 2, input: "one",              output: "1", sample: true },
      { idx: 3, input: "a b c d e f g h", output: "8", sample: false },
    ],
  },
  {
    slug: "fibonacci-nth",
    title: "Fibonacci N-th Term",
    description: "Given N (1-indexed), print the N-th Fibonacci number. F(1)=1, F(2)=1, F(3)=2, ...\n\nExample:\nInput: 6\nOutput: 8",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "1",  output: "1",   sample: true },
      { idx: 2, input: "6",  output: "8",   sample: true },
      { idx: 3, input: "10", output: "55",  sample: false },
      { idx: 4, input: "20", output: "6765",sample: false },
    ],
  },
  {
    slug: "power-of-two",
    title: "Power of Two",
    description: "Given a positive integer N, print 'YES' if it is a power of 2, otherwise 'NO'.\n\nExample:\nInput: 8\nOutput: YES",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "1",   output: "YES", sample: true },
      { idx: 2, input: "8",   output: "YES", sample: true },
      { idx: 3, input: "6",   output: "NO",  sample: false },
      { idx: 4, input: "1024",output: "YES", sample: false },
    ],
  },
  {
    slug: "sum-of-digits",
    title: "Sum Of Digits",
    description: "Given a non-negative integer N, print the sum of its digits.\n\nExample:\nInput: 123\nOutput: 6",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "123", output: "6", sample: true },
      { idx: 2, input: "908", output: "17", sample: true },
      { idx: 3, input: "0", output: "0", sample: false },
    ],
  },
  {
    slug: "even-or-odd",
    title: "Even Or Odd",
    description: "Given a number N, print 'EVEN' if it is even and 'ODD' otherwise.\n\nExample:\nInput: 7\nOutput: ODD",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "7", output: "ODD", sample: true },
      { idx: 2, input: "24", output: "EVEN", sample: true },
      { idx: 3, input: "-3", output: "ODD", sample: false },
    ],
  },
  {
    slug: "gcd-of-two",
    title: "GCD Of Two",
    description: "Given two integers A and B, print their greatest common divisor.\n\nExample:\nInput: 12 18\nOutput: 6",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "12 18", output: "6", sample: true },
      { idx: 2, input: "9 27", output: "9", sample: true },
      { idx: 3, input: "17 13", output: "1", sample: false },
    ],
  },
  {
    slug: "max-in-array",
    title: "Max In Array",
    description: "Given a list of integers on one line, print the largest value.\n\nExample:\nInput: 4 9 1 7\nOutput: 9",
    difficulty: ProblemDifficulty.EASY,
    cases: [
      { idx: 1, input: "4 9 1 7", output: "9", sample: true },
      { idx: 2, input: "-5 -2 -9", output: "-2", sample: true },
      { idx: 3, input: "100 3 44 88", output: "100", sample: false },
    ],
  },
  {
    slug: "average-rounded",
    title: "Average Rounded",
    description: "Given three integers, print their average rounded down to the nearest integer.\n\nExample:\nInput: 2 4 5\nOutput: 3",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "2 4 5", output: "3", sample: true },
      { idx: 2, input: "10 20 30", output: "20", sample: true },
      { idx: 3, input: "1 1 2", output: "1", sample: false },
    ],
  },
  {
    slug: "prefix-sum-query",
    title: "Prefix Sum Query",
    description: "Given N integers and a query index K, print the sum of the first K numbers. The input format is: first line N, second line the array, third line K.\n\nExample:\nInput:\n5\n1 2 3 4 5\n3\nOutput: 6",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "5\n1 2 3 4 5\n3", output: "6", sample: true },
      { idx: 2, input: "4\n10 20 30 40\n2", output: "30", sample: true },
      { idx: 3, input: "3\n7 8 9\n1", output: "7", sample: false },
    ],
  },
  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    description: "Given a string containing only parentheses, print 'YES' if it is balanced and 'NO' otherwise.\n\nExample:\nInput: (())\nOutput: YES",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "(())", output: "YES", sample: true },
      { idx: 2, input: "(()", output: "NO", sample: true },
      { idx: 3, input: ")()(", output: "NO", sample: false },
    ],
  },
  {
    slug: "longest-word",
    title: "Longest Word",
    description: "Given a sentence, print the longest word. If there are multiple, print the first one.\n\nExample:\nInput: code forge platform\nOutput: platform",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "code forge platform", output: "platform", sample: true },
      { idx: 2, input: "a bb ccc dd", output: "ccc", sample: true },
      { idx: 3, input: "one two", output: "one", sample: false },
    ],
  },
  {
    slug: "matrix-diagonal-sum",
    title: "Matrix Diagonal Sum",
    description: "Given a 3x3 matrix, print the sum of the main diagonal. The nine numbers are given in row-major order.\n\nExample:\nInput: 1 2 3 4 5 6 7 8 9\nOutput: 15",
    difficulty: ProblemDifficulty.MEDIUM,
    cases: [
      { idx: 1, input: "1 2 3 4 5 6 7 8 9", output: "15", sample: true },
      { idx: 2, input: "9 1 2 3 8 4 5 6 7", output: "24", sample: true },
      { idx: 3, input: "2 0 1 4 3 6 7 8 5", output: "10", sample: false },
    ],
  },
  {
    slug: "prime-check",
    title: "Prime Check",
    description: "Given a positive integer N, print 'PRIME' if it is prime and 'COMPOSITE' otherwise.\n\nExample:\nInput: 7\nOutput: PRIME",
    difficulty: ProblemDifficulty.HARD,
    cases: [
      { idx: 1, input: "7", output: "PRIME", sample: true },
      { idx: 2, input: "18", output: "COMPOSITE", sample: true },
      { idx: 3, input: "97", output: "PRIME", sample: false },
      { idx: 4, input: "100", output: "COMPOSITE", sample: false },
    ],
  },
  {
    slug: "maximum-subarray-sum",
    title: "Maximum Subarray Sum",
    description: "Given a list of integers, print the maximum possible sum of any contiguous subarray.\n\nExample:\nInput: -2 1 -3 4 -1 2 1 -5 4\nOutput: 6",
    difficulty: ProblemDifficulty.HARD,
    cases: [
      { idx: 1, input: "-2 1 -3 4 -1 2 1 -5 4", output: "6", sample: true },
      { idx: 2, input: "1 2 3", output: "6", sample: true },
      { idx: 3, input: "-5 -1 -8", output: "-1", sample: false },
    ],
  },
  {
    slug: "longest-common-prefix",
    title: "Longest Common Prefix",
    description: "Given three words on a single line, print the longest common prefix shared by all of them. If there is no common prefix, print an empty line.\n\nExample:\nInput: flower flow flight\nOutput: fl",
    difficulty: ProblemDifficulty.HARD,
    cases: [
      { idx: 1, input: "flower flow flight", output: "fl", sample: true },
      { idx: 2, input: "interview internet internal", output: "inter", sample: true },
      { idx: 3, input: "dog race car", output: "", sample: false },
    ],
  },
];

async function main() {
  // Demo user
  await prisma.user.upsert({
    where: { email: "demo@codeforge.dev" },
    update: { username: "demo_user", passwordHash: "demo_hash_phase2" },
    create: { email: "demo@codeforge.dev", username: "demo_user", passwordHash: "demo_hash_phase2" },
  });

  for (const p of PROBLEMS) {
    const problem = await prisma.problem.upsert({
      where: { slug: p.slug },
      update: { title: p.title, description: p.description, difficulty: p.difficulty },
      create: { title: p.title, slug: p.slug, description: p.description, difficulty: p.difficulty },
    });

    for (const c of p.cases) {
      await prisma.testCase.upsert({
        where: { problemId_orderIndex: { problemId: problem.id, orderIndex: c.idx } },
        update: { input: c.input, expectedOutput: c.output, isSample: c.sample },
        create: {
          problemId: problem.id,
          orderIndex: c.idx,
          input: c.input,
          expectedOutput: c.output,
          isSample: c.sample,
        },
      });
    }
  }

  const problemCount = await prisma.problem.count();
  const testCaseCount = await prisma.testCase.count();
  console.log("Seed completed", { problemCount, testCaseCount });
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
