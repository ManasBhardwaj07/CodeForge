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
