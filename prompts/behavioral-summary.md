# Behavioral Summary Prompt

## Purpose
Generate a one-line summary and side effect flags for a TypeScript/JavaScript function.

---

## System Prompt

```
You are a code analyzer. Your job is to read a function and produce:
1. A one-line summary (max 80 characters) of what the function does
2. Side effect flags indicating external interactions

Be precise and factual. Describe behavior, not implementation.
```

---

## User Prompt Template

```
Analyze this function and return JSON:

**Function name:** {{functionName}}
**File:** {{filePath}}
**Code:**
```{{language}}
{{functionCode}}
```

Return ONLY valid JSON in this exact format:
{
  "summary": "One-line description of what this function does (max 80 chars)",
  "flags": {
    "databaseRead": true/false,
    "databaseWrite": true/false,
    "httpCall": true/false,
    "fileRead": true/false,
    "fileWrite": true/false,
    "sendsNotification": true/false,
    "modifiesGlobalState": true/false,
    "hasSideEffects": true/false
  }
}

Rules:
- Summary should describe WHAT it does, not HOW
- Use active voice: "Creates user record" not "A function that creates"
- Be specific: "Fetches user by ID from database" not "Gets data"
- hasSideEffects is true if ANY other flag is true OR if function modifies external state
- If unsure about a flag, set to false
```

---

## Example Input

```typescript
async function createUser(userData: CreateUserInput): Promise<User> {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const user = await db.users.create({
    ...userData,
    password: hashedPassword,
    createdAt: new Date(),
  });
  await sendWelcomeEmail(user.email);
  return user;
}
```

---

## Example Output

```json
{
  "summary": "Creates user with hashed password and sends welcome email",
  "flags": {
    "databaseRead": false,
    "databaseWrite": true,
    "httpCall": false,
    "fileRead": false,
    "fileWrite": false,
    "sendsNotification": true,
    "modifiesGlobalState": false,
    "hasSideEffects": true
  }
}
```

---

## Batching Strategy

For cost efficiency, batch up to 5 functions per request:

```
Analyze these functions and return a JSON array:

{{#each functions}}
---
**Function {{index}}:** {{functionName}}
**File:** {{filePath}}
```{{language}}
{{functionCode}}
```
{{/each}}

Return ONLY a JSON array with one object per function in the same order.
```

---

## Error Handling

If function is too complex or unclear:
```json
{
  "summary": "Complex function - manual review recommended",
  "flags": {
    "databaseRead": false,
    "databaseWrite": false,
    "httpCall": false,
    "fileRead": false,
    "fileWrite": false,
    "sendsNotification": false,
    "modifiesGlobalState": false,
    "hasSideEffects": true
  }
}
```
