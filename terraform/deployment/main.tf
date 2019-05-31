# Root module

provider "aws" {
  region = var.region
}

# Fetching a module from github (using a subdirectory and ref)
module "sg_module" {
  source = "../sg_module"

  vpc_id = var.vpc_id
}

# Using a local module
module "ec2_module" {
  source = "../ec2_module"

  sg_id     = module.sg_module.sg_id
  subnet_id = var.subnet_id
}
