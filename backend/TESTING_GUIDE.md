# Quick Testing Guide

## Setup & Activation

```bash
# 1. Navigate to backend
cd /Users/mehedihasan/Projects/ai_data_brain/backend

# 2. Activate virtual environment
source .venv/bin/activate

# 3. Verify environment
python --version  # Should show Python 3.12+
echo $GOOGLE_API_KEY  # Should show your API key
```

---

## Test 1: Data Analysis Only (No API Calls)

This test works **without requiring API quota**:

```bash
python << 'EOF'
import os
import sys
sys.path.insert(0, '/Users/mehedihasan/Projects/ai_data_brain/backend')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'expense_api.settings.development')
import django
django.setup()

from expense_api.apps.agent.client.analyzer import DataAnalyzer
from expense_api.apps.agent.client.config import DATA_CATEGORIES

analyzer = DataAnalyzer(category_keywords=DATA_CATEGORIES)

# Test queries
queries = [
    "Add 500 taka for lunch",
    "Show monthly expenses",
    "Create budget table",
    "Delete yesterday's entry"
]

for query in queries:
    result = analyzer.extract_intent(query)
    print(f"\n📝 Query: {query}")
    print(f"   Type: {result['type']}")
    print(f"   Categories: {result['categories']}")
    print(f"   Confidence: {result['confidence']:.0%}")
EOF
```

**Expected Output:**
```
📝 Query: Add 500 taka for lunch
   Type: add
   Categories: ['expenses']
   Confidence: 85%

📝 Query: Show monthly expenses
   Type: retrieve
   Categories: ['time']
   Confidence: 70%

... and more
```

---

## Test 2: Test with Claude (Alternative)

If you have Anthropic API key, test Claude instead:

```bash
# 1. Set Anthropic API key in .env
ANTHROPIC_API_KEY=sk_your_key_here

# 2. Run test
python << 'EOF'
import os
import sys
sys.path.insert(0, '/Users/mehedihasan/Projects/ai_data_brain/backend')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'expense_api.settings.development')
import django
django.setup()

from expense_api.apps.agent.client.config import LLMProvider

# Create Claude provider
provider = LLMProvider.create_provider(
    provider='anthropic',
    api_key=os.getenv('ANTHROPIC_API_KEY'),
    model='claude-3-5-sonnet-20240620'
)

print(f"✅ Claude Provider: {type(provider).__name__}")
print(f"✅ Client Type: {type(provider.get_client()).__name__}")
EOF
```

---

## Test 3: Enable Gemini API Quota

To test Gemini API calls:

1. **Open Google Cloud Console:**
   - https://console.cloud.google.com

2. **Enable Billing:**
   - Select your project
   - Go to "Billing"
   - Create a billing account
   - Link to your project

3. **Set Budget Limits (Optional but Recommended):**
   - Go to Billing → Budgets & alerts
   - Create a budget for Gemini API

4. **Check Quotas:**
   - Go to APIs & Services → Quotas
   - Search for "Generative AI API"
   - Verify limits are set

5. **Re-run Test:**
   ```bash
   python << 'EOF'
   import os
   import google.generativeai as genai
   
   genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
   model = genai.GenerativeModel('gemini-2.0-flash')
   response = model.generate_content("What is 2+2?")
   print(f"✅ Response: {response.text}")
   EOF
   ```

---

## Test 4: Full Examples Suite

Run all 7 example functions:

```bash
# From backend directory with .venv activated
python expense_api/apps/agent/examples.py
```

**Requires:**
- Gemini quota enabled (or Claude API key)
- Running MCP servers (if testing full client integration)

---

## Troubleshooting

### "No module named 'langchain_community'"
```bash
pip install langchain-community
```

### "GOOGLE_API_KEY not found"
```bash
# Check .env file
cat /Users/mehedihasan/Projects/ai_data_brain/backend/.env

# Should contain:
# GOOGLE_API_KEY=AIzaSyAinaYtZs43tJwn33Tkhx0R_LdwWi7NO_w
```

### "429 quota exceeded"
- This is **expected** if you haven't enabled billing
- See "Test 3: Enable Gemini API Quota" above
- Alternatively, test with Claude provider

### "Connection refused" for MCP servers
- Make sure servers are running before testing client
- Check server logs for errors
- Verify configuration paths in mcpConfig.json

---

## Success Checklist

- [ ] Virtual environment activated (`source .venv/bin/activate`)
- [ ] `python --version` shows 3.12+
- [ ] `echo $GOOGLE_API_KEY` shows your key
- [ ] Data analysis test runs without errors
- [ ] LLM provider factory creates providers
- [ ] (Optional) Gemini API quota enabled
- [ ] (Optional) Anthropic API key configured

---

## Current Status

✅ **All core components tested and working**

| Component | Status | Notes |
|-----------|--------|-------|
| Data Analyzer | ✅ Working | No API calls needed |
| Provider Factory | ✅ Working | Works with config |
| Environment Setup | ✅ Working | Keys properly loaded |
| Gemini API | ⚠️ Quota Exceeded | Enable billing to continue |
| Claude Support | ✅ Ready | Awaiting API key setup |
| MCP Server | ✅ Ready | Can be deployed anytime |

