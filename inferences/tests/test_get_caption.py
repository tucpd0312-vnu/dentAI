import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from inferences import get_caption


STRUCTURED_INPUT = 'Tooth gingivitis levels: 1, 2, 0, 1, 2, 0, 3, 2, 1, 0, 1, 2'


class HybridCaptionBackendTests(unittest.TestCase):
    def setUp(self):
        get_caption._reset_caption_backend_state()

    def tearDown(self):
        get_caption._reset_caption_backend_state()

    def test_rule_mode_does_not_touch_t5(self):
        with mock.patch.dict(os.environ, {'CAPTION_MODE': 'rule'}, clear=True):
            with mock.patch.object(get_caption, '_generate_t5_caption') as generate_t5:
                caption = get_caption.generate_caption(STRUCTURED_INPUT)

        generate_t5.assert_not_called()
        self.assertIn('MGI 1 tại răng 13, 21', caption)
        self.assertIn('MGI 3 tại răng 43', caption)

    def test_auto_mode_falls_back_when_weights_are_missing(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            model_dir = Path(temporary_dir)
            (model_dir / 'config.json').write_text('{}', encoding='utf-8')
            (model_dir / 'tokenizer.json').write_text('{}', encoding='utf-8')
            environment = {'CAPTION_MODE': 'auto', 'T5_MODEL_DIR': str(model_dir)}

            with mock.patch.dict(os.environ, environment, clear=True):
                with mock.patch.object(get_caption, '_generate_t5_caption') as generate_t5:
                    caption = get_caption.generate_caption(STRUCTURED_INPUT)

        generate_t5.assert_not_called()
        self.assertIn('Hàm trên', caption)

    def test_t5_mode_reports_missing_weights(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            environment = {'CAPTION_MODE': 't5', 'T5_MODEL_DIR': temporary_dir}
            with mock.patch.dict(os.environ, environment, clear=True):
                with self.assertRaisesRegex(RuntimeError, 'checkpoint không sẵn sàng'):
                    get_caption.generate_caption(STRUCTURED_INPUT)

    def test_auto_mode_uses_t5_when_checkpoint_is_complete(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            model_dir = Path(temporary_dir)
            for filename in ('config.json', 'tokenizer.json', 'model.safetensors'):
                (model_dir / filename).write_text('{}', encoding='utf-8')
            environment = {'CAPTION_MODE': 'auto', 'T5_MODEL_DIR': str(model_dir)}

            with mock.patch.dict(os.environ, environment, clear=True):
                with mock.patch.object(
                    get_caption,
                    '_generate_t5_caption',
                    return_value='Caption do T5 sinh.',
                ) as generate_t5:
                    caption = get_caption.generate_caption(STRUCTURED_INPUT)

        generate_t5.assert_called_once()
        self.assertEqual(caption, 'Caption do T5 sinh.')

    def test_auto_mode_circuit_breaks_after_t5_runtime_error(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            model_dir = Path(temporary_dir)
            for filename in ('config.json', 'tokenizer.json', 'pytorch_model.bin'):
                (model_dir / filename).write_text('{}', encoding='utf-8')
            environment = {'CAPTION_MODE': 'auto', 'T5_MODEL_DIR': str(model_dir)}

            with mock.patch.dict(os.environ, environment, clear=True):
                with mock.patch.object(
                    get_caption,
                    '_generate_t5_caption',
                    side_effect=OSError('checkpoint hỏng'),
                ) as generate_t5:
                    first_caption = get_caption.generate_caption(STRUCTURED_INPUT)
                    second_caption = get_caption.generate_caption(STRUCTURED_INPUT)

        generate_t5.assert_called_once()
        self.assertEqual(first_caption, second_caption)
        self.assertIn('Hàm dưới', first_caption)

    def test_invalid_mode_fails_with_configuration_error(self):
        with mock.patch.dict(os.environ, {'CAPTION_MODE': 'unknown'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'CAPTION_MODE'):
                get_caption.generate_caption(STRUCTURED_INPUT)


if __name__ == '__main__':
    unittest.main()
