**Type:** Build log

**Title:** `input_image` parts are silently dropped, so vision tasks run blind and return 200

**Building:** Pit Crew turns a hackathon project into a narrated pitch video. For uploaded gameplay footage, we send the agent keyframes so the narration matches what's on screen.

**Blocked:** Images sent as `input_image` never reach the agent, yet the task returns HTTP 200.

Steps to reproduce:
1. `POST /v1/responses` with `metadata.harness_id` and
   `input: [{type:"message", role:"user", content:[{type:"input_text", text:"Describe this screenshot in one sentence."}, {type:"input_image", image_url:"data:image/jpeg;base64,…"}]}]` (a 20 KB JPEG).
2. Read the final message.

- **Expected:** a description of the image, or a 4xx naming the unsupported content type.
- **Actual:** after 24 s, HTTP 200 with *"I can't describe a screenshot because none reached me: there is no image attached to this request, and the workspace has no image files."*

**Cost to us:** our first footage video narrated scenes that weren't in the clip, because the agent had to guess. Finding the cause and the workaround took about 15 minutes, plus re-running the job.

**Loved:** the workaround is good. The same JPEG sent as `{type:"input_file", filename:"f1.jpg", file_data:"data:image/jpeg;base64,…"}` lands in the agent's workspace. Its vision tool then read it accurately: *"Question #1 of 3 … who wrote 'Pride and Prejudice'"*.

**Want:**
- Support `input_image` (map it to a workspace file the same way `input_file` is mapped).
- Or reject it with `400 unsupported_content_type` and a hint: "send images as input_file".
- Either way, list in `metadata.ignored_fields` any content parts that were dropped.

**Who benefits:** anyone porting Responses-style code (where images commonly go as `input_image`) and anyone sending screenshots for QA, UI review or demos. A silent drop is the worst failure for an agent, because it confidently works around the missing input.

**Labels:** The Big Hack Game, uhp, multimodal, errors

**Roadmap:** Related: #R?

