import sys
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
from ml.train import prepare, fit_model, ROOT

class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='neuroarc-training-')
        cls.directory=Path(cls.temp.name)
        subprocess.run(['node',str(ROOT/'ml/smoke-fixture.mjs'),str(cls.directory)],check=True,capture_output=True)
        cls.paths=sorted(cls.directory.glob('*.json'))
        cls.dataset=prepare(cls.paths)
        cls.artifact,cls.report=fit_model(cls.dataset,allow_synthetic=True)
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()
    def test_real_fit_and_group_holdout(self):
        self.assertTrue(any(abs(c)>1e-5 for c in self.artifact['coefficients']))
        train=set(self.report['trainParticipantKeys']);test=set(self.report['testParticipantKeys'])
        self.assertFalse(train & test)
        self.assertEqual(len(train)+len(test),8)
        rows=[r for r in self.dataset['records'] if r['participant'] in train]
        np.testing.assert_allclose(np.mean([r['features'] for r in rows],axis=0),self.artifact['mean'],rtol=1e-10,atol=1e-10)
        self.assertEqual(self.artifact['dataKind'],'synthetic_smoke_test')
        self.assertEqual(self.artifact['difficultyLevels'],[1,2,3,4])
        self.assertEqual(set(self.report['byDifficulty']),{'1','2','3','4'})
        self.assertEqual(sum(v['trials'] for v in self.report['byDifficulty'].values()),self.artifact['evaluation']['testTrials'])
    def test_small_or_synthetic_data_cannot_silently_train_as_real(self):
        with self.assertRaisesRegex(ValueError,'Synthetic'): fit_model(self.dataset)
        with self.assertRaisesRegex(ValueError,'50'): fit_model({**self.dataset,'records':self.dataset['records'][:10]},allow_synthetic=True)
        altered={**self.dataset,'records':[{**r,'participant':'one-person'} for r in self.dataset['records']]}
        with self.assertRaisesRegex(ValueError,'five'):fit_model(altered,allow_synthetic=True)
    def test_fitted_artifact_matches_browser_inference_and_synthetic_activation_rejected(self):
        # Check a held-out participant using identical browser history features.
        person=self.report['testParticipantKeys'][0]
        export=next(json.loads(p.read_text()) for p in self.paths if json.loads(p.read_text())['participantKey']==person)
        trial=export['session']['trials'][5];history=export['session']['trials'][:5]
        heldout=next(p for p in self.report['holdoutPredictions'] if p['trialKey']==f"{trial['seed']}|{trial['condition']}|{trial['completedAt']}")
        script="""import fs from 'node:fs';import {inferTaskModel,validateTaskModel} from './src/taskPerformance.js';const x=JSON.parse(fs.readFileSync(0,'utf8'));const prediction=inferTaskModel(x.model,x.history,x.condition,x.level);let rejected=false;try{validateTaskModel(x.model)}catch{rejected=true}process.stdout.write(JSON.stringify({probability:prediction.probability,rejected}));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'model':self.artifact,'history':history,'condition':trial['condition'],'level':trial['difficultyLevel']}),text=True,capture_output=True,check=True)
        actual=json.loads(result.stdout)
        self.assertAlmostEqual(actual['probability'],heldout['probability'],places=12)
        self.assertTrue(actual['rejected'])
    def test_cli_creates_portable_model_and_report(self):
        output=self.directory/'output'
        result=subprocess.run([sys.executable,str(ROOT/'ml/train.py'),*map(str,self.paths),'--output',str(output),'--allow-synthetic-smoke-test'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads((output/'task-model.json').read_text())['schema'],'neuroarc-task-logreg-v2')
        self.assertTrue((output/'evaluation.json').exists())
if __name__=='__main__':unittest.main()
