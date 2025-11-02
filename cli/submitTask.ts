#!/usr/bin/env ts-node

import { submitTask } from "../middleware/index.ts";

const args = process.argv.slice(2);
const model = args[0] || "resnet50";
const input = args[1] || "dummy_input";

submitTask(model, input);
