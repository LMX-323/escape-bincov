import assert from 'node:assert/strict';
import test from 'node:test';
import { envLine, rendererProblem } from './check-renderer.mjs';

const lavapipe = 'ANGLE (Mesa, Vulkan 1.4.335 (llvmpipe (LLVM 21.1.8 256 bits) (0x00000000)), llvmpipe)';
const swiftShader = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

test('the renderer check fails on no WebGL or a renderer other than the expected one', () => {
  assert.equal(rendererProblem(lavapipe, 'Vulkan.*llvmpipe'), null);
  assert.match(rendererProblem(swiftShader, 'Vulkan.*llvmpipe'), /does not match/);
  assert.equal(rendererProblem(null, 'Vulkan.*llvmpipe'), 'WebGL is unavailable');
  assert.equal(rendererProblem(null, undefined), 'WebGL is unavailable');
  assert.equal(rendererProblem(swiftShader, undefined), null, 'without an expectation any WebGL renderer passes');
});

test('the recorded renderer stays one $GITHUB_ENV line', () => {
  assert.equal(envLine('BINCOV_RENDERER', lavapipe), `BINCOV_RENDERER=${lavapipe}\n`);
  assert.equal(envLine('BINCOV_RENDERER', 'a\nINJECTED=1\r\nb'), 'BINCOV_RENDERER=a INJECTED=1 b\n');
});
