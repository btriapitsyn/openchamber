import fs from "fs";
import path from "path";
import yaml from "yaml";

const skillsDir = ".opencode/skills";
const manifestPath = ".opencode/skills_manifest.json";

async function generateManifest() {
  const skills = [];
  const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        const content = await fs.promises.readFile(skillMdPath, "utf8");
        const match = content.match(
          /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/,
        );

        if (match) {
          try {
            const frontmatter = yaml.parse(match[1]);
            skills.push({
              id: entry.name,
              name: frontmatter.name || entry.name,
              description: frontmatter.description || "",
              path: skillMdPath,
              vibe: content.match(/_Vibe: (.*)\._/)?.[1] || "Unknown",
            });
          } catch (e) {
            console.error(`Failed to parse ${skillMdPath}:`, e);
          }
        }
      }
    }
  }

  await fs.promises.writeFile(manifestPath, JSON.stringify(skills, null, 2));
  console.log(
    `Manifest generated with ${skills.length} skills at ${manifestPath}`,
  );
}

generateManifest();
