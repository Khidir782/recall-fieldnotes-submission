import unittest
from fastapi.testclient import TestClient
from backend.main import app

class APITests(unittest.TestCase):
    def setUp(self): self.client = TestClient(app)
    def test_presets_and_assessment(self):
        presets = self.client.get('/cohort-presets').json()
        self.assertEqual(presets['source'], 'synthetic')
        for subject in presets['subjects']:
            r = self.client.post('/assess', json={'values': subject['values']})
            self.assertEqual(r.status_code, 200)
            result = r.json()
            self.assertAlmostEqual(50 + sum(c['value'] for c in result['contributions']), result['score'])
    def test_invalid_payloads(self):
        for values in [[1,2], [101,1,1,1,1], [-1,1,1,1,1]]:
            self.assertEqual(self.client.post('/assess', json={'values':values}).status_code,422)
        self.assertEqual(self.client.post('/simulate-intervention', json={'values':[50]*5,'adherence':101}).status_code,422)
        self.assertEqual(self.client.post('/simulate-intervention', json={'values':[50]*5,'minutes':0}).status_code,422)
    def test_simulation(self):
        result = self.client.post('/simulate-intervention', json={'values':[50]*5, 'adherence':0}).json()
        self.assertEqual(result['difference'],0)
        self.assertEqual(len(result['points']),13)
    def test_roi_correlation_and_constant_rejection(self):
        matrix = self.client.post('/roi-correlations',json={'rows':[[1,3],[2,2],[3,1]]}).json()['matrix']
        self.assertEqual(matrix,[[1,-1],[-1,1]])
        for rows in [[[1,1],[1,2],[1,3]], [[1,2],[2],[3,4]]]:
            self.assertEqual(self.client.post('/roi-correlations',json={'rows':rows}).status_code,422)
    def test_no_cross_origin_wildcard(self):
        r=self.client.options('/assess',headers={'Origin':'https://example.com','Access-Control-Request-Method':'POST'})
        self.assertNotIn('access-control-allow-origin',r.headers)
if __name__ == '__main__': unittest.main()
