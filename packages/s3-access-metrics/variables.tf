variable "prefix" {
  type = string
}

variable "stack" {
  type = string
}

variable "logs_bucket" {
  type = string
}

variable "logs_prefix" {
  type    = string
  default = ""
}

variable "permissions_boundary" {
  type    = string
  default = null
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "subnet_ids" {
  type    = list(string)
  default = []
}
