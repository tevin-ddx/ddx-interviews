import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import bcryptjs from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: "admin@codestream.dev" },
  });

  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        email: "admin@codestream.dev",
        password: bcryptjs.hashSync("admin123", 10),
        name: "Admin",
      },
    });
    console.log("Created admin user: admin@codestream.dev / admin123");
  } else {
    console.log("Admin user already exists");
  }

  const questionCount = await prisma.question.count();
  if (questionCount === 0) {
    await prisma.question.createMany({
      data: [
        {
          title: "Two Sum",
          description:
            "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.",
          boilerplateCode:
            'def two_sum(nums: list[int], target: int) -> list[int]:\n    # Your code here\n    pass\n\n# Test\nprint(two_sum([2, 7, 11, 15], 9))',
          difficulty: "easy",
          category: "Arrays",
        },
        {
          title: "Fibonacci Sequence",
          description:
            "Write a function that returns the nth number in the Fibonacci sequence. The sequence starts with 0, 1, 1, 2, 3, 5, 8, ...",
          boilerplateCode:
            "def fibonacci(n: int) -> int:\n    # Your code here\n    pass\n\n# Test\nfor i in range(10):\n    print(f'F({i}) = {fibonacci(i)}')",
          difficulty: "easy",
          category: "Recursion",
        },
        {
          title: "Reverse Linked List",
          description:
            "Given the head of a singly linked list, reverse the list, and return the reversed list.",
          boilerplateCode:
            "class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head):\n    # Your code here\n    pass\n\n# Test\nhead = ListNode(1, ListNode(2, ListNode(3, ListNode(4, ListNode(5)))))\nresult = reverse_list(head)\nwhile result:\n    print(result.val, end=' -> ' if result.next else '\\n')\n    result = result.next",
          difficulty: "medium",
          category: "Linked Lists",
        },
      ],
    });
    console.log("Created sample questions");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
