import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NeutralToneMapping, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { builtinAOContext, mrt, normalView, pass, screenUV } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { useSettings } from "../ui/settings";

/**
 * Takes over rendering: ambient occlusion grounds everything in its corners (high quality only),
 * bloom makes the light lines, skylight and water glow. Neutral tone mapping keeps the art's colors
 * close to what was made in the lab.
 */
export function Effects() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const { quality } = useSettings();

  const pipeline = useMemo(() => {
    gl.toneMapping = NeutralToneMapping;
    gl.toneMappingExposure = 1;
    const p = new RenderPipeline(gl);
    const scenePass = pass(scene, camera);
    if (quality === "high") {
      // A normals-and-depth pre-pass feeds GTAO, whose result darkens the scene's indirect light.
      const prePass = pass(scene, camera);
      prePass.setMRT(mrt({ output: normalView }));
      const aoPass = ao(prePass.getTextureNode("depth"), prePass.getTextureNode(), camera);
      aoPass.resolutionScale = 0.5;
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
    }
    const color = scenePass.getTextureNode();
    p.outputNode = color.add(bloom(color, quality === "high" ? 0.55 : 0.4, 0.45, 0.82));
    return p;
  }, [gl, scene, camera, quality]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  // Priority 1 tells R3F we render the frame ourselves.
  useFrame(() => pipeline.render(), 1);
  return null;
}
