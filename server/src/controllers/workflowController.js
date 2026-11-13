const WorkflowConfig = require('../models/WorkflowConfig');

/**
 * List all workflow configurations across versions
 */
const listConfigs = async (req, res, next) => {
  try {
    const { name = 'LOAN_APPROVAL' } = req.query;
    const configs = await WorkflowConfig.find({ name }).sort({ version: -1 });
    return res.json({ data: configs });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific workflow configuration by ID
 */
const getConfig = async (req, res, next) => {
  try {
    const { id } = req.params;
    const config = await WorkflowConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        error: { code: 'CONFIG_NOT_FOUND', message: `Workflow configuration '${id}' not found.` }
      });
    }
    return res.json(config);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new incremental version of a workflow configuration
 */
const createConfig = async (req, res, next) => {
  try {
    const { name = 'LOAN_APPROVAL', description, inputSchema, steps, rules, fallbackAction } = req.body;

    // Find highest version number for this workflow name
    const latestConfig = await WorkflowConfig.findOne({ name }).sort({ version: -1 });
    const nextVersion = latestConfig ? latestConfig.version + 1 : 1;

    const newConfig = await WorkflowConfig.create({
      name,
      version: nextVersion,
      status: 'DRAFT',
      isImmutable: false,
      description: description || `Version ${nextVersion} of ${name}`,
      inputSchema: inputSchema || { type: 'object' },
      steps: steps || [],
      rules: rules || [],
      fallbackAction: fallbackAction || {
        outcome: 'MANUAL_REVIEW',
        reasonCode: 'NO_EXPLICIT_APPROVAL_MATCH',
        message: 'Requires manual underwriting review'
      }
    });

    return res.status(201).json({
      message: `Workflow configuration version ${nextVersion} created in DRAFT state.`,
      config: newConfig
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate a workflow version and archive the previously active version
 */
const activateConfig = async (req, res, next) => {
  try {
    const { id } = req.params;
    const configToActivate = await WorkflowConfig.findById(id);

    if (!configToActivate) {
      return res.status(404).json({
        error: { code: 'CONFIG_NOT_FOUND', message: `Workflow configuration '${id}' not found.` }
      });
    }

    if (configToActivate.status === 'ACTIVE') {
      return res.json({
        message: `Workflow configuration version ${configToActivate.version} is already ACTIVE.`,
        config: configToActivate
      });
    }

    // Archive current active version for this workflow name
    await WorkflowConfig.updateMany(
      { name: configToActivate.name, status: 'ACTIVE' },
      { $set: { status: 'ARCHIVED' } }
    );

    // Activate and lock this version
    configToActivate.status = 'ACTIVE';
    configToActivate.isImmutable = true;
    await configToActivate.save();

    return res.json({
      message: `Workflow configuration version ${configToActivate.version} is now ACTIVE and locked.`,
      config: configToActivate
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listConfigs,
  getConfig,
  createConfig,
  activateConfig
};

