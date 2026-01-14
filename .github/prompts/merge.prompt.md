---
agent: agent
model: Claude Haiku 4.5 (copilot)
---
Use `cat` as the rebase editor to  merge the develop branch into the release branch.

Pull changes from origin release branch, using rebase and then:
1. Accept all the incoming changes with no conflicts.
2. If conflict is detected, take the incoming changes and merge only the part what was changed in develop to the incoming change. Eg.   
   - incoming change: `function add(a, b, c) { return a + b + c; }`
   - develop change: `function addAB(a, b) { return a + b; }`
   - merged result: `function addAB(a, b, c) { return a + b + c; }`
3. In case of any ambigiuity, ask for clarification.
4. Before each merge, ALWAYS STOP for confirmation and describe what will be merged, if possible, preview the code change being made.