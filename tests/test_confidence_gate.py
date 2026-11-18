"""Exercise the prediction decision without credentials, models, or network calls."""

import ast
from pathlib import Path
import unittest


def load_confidence_gate():
    path = Path(__file__).resolve().parents[1] / "backend/app/main.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    settings = [
        node for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id in (
            "CONFIDENCE_THRESHOLD", "MIN_GAP"
        ) for target in node.targets)
    ]
    predict = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "predict"
    )
    start = next(
        index for index, node in enumerate(predict.body)
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "top_breed"
                for target in node.targets)
    )
    # Use the real decision statements, skipping only the external save side effect.
    decision = [
        node for node in predict.body[start:]
        if not (
            isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "save_scan"
        )
    ]
    wrapper = ast.parse("def decide(top3): pass").body[0]
    wrapper.body = decision
    module = ast.fix_missing_locations(ast.Module(body=settings + [wrapper], type_ignores=[]))
    namespace = {"format_info": lambda breed: "Breed information"}
    exec(compile(module, str(path), "exec"), namespace)
    return namespace["decide"]


class ConfidenceGateTests(unittest.TestCase):
    def setUp(self):
        self.decide = load_confidence_gate()

    def result(self, first, second, third):
        return self.decide([
            {"breed": "Beagle", "confidence": first},
            {"breed": "Foxhound", "confidence": second},
            {"breed": "Other", "confidence": third},
        ])

    def test_low_confidence_remains_uncertain_despite_clear_lead(self):
        self.assertEqual(self.result(0.34, 0.10, 0.05)["status"], "uncertain")

    def test_close_runner_up_is_uncertain_even_above_confidence_threshold(self):
        self.assertEqual(self.result(0.50, 0.40, 0.05)["status"], "uncertain")

    def test_tied_predictions_are_uncertain(self):
        self.assertEqual(self.result(0.45, 0.45, 0.05)["status"], "uncertain")

    def test_clear_high_confidence_prediction_is_ok(self):
        result = self.result(0.80, 0.10, 0.05)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["breed"], "Beagle")
        self.assertEqual(result["confidence"], 0.80)
        self.assertEqual(len(result["top3"]), 3)

    def test_both_thresholds_accept_equality(self):
        self.assertEqual(self.result(0.35, 0.20, 0.10)["status"], "ok")

    def test_gap_just_below_threshold_is_uncertain(self):
        self.assertEqual(self.result(0.40, 0.251, 0.10)["status"], "uncertain")


if __name__ == "__main__":
    unittest.main()
